import {
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  type CheckoutInput,
  type OrderStatus,
} from '@ecommerce/shared';
import { env, features } from '../config/env';
import { pool, withTransaction, type Db, type Tx } from '../db/pool';
import { badRequest, conflict, HttpError, notFound, round2 } from '../lib/http';
import { createRazorpayOrder } from '../lib/integrations';
import { getSettings, shippingFor } from '../lib/settings';

interface OrderRow {
  id: string;
  order_number: string;
  user_id: string | null;
  status: OrderStatus;
  payment_method: 'cod' | 'razorpay';
  payment_status: string;
  total: number;
  razorpay_order_id: string | null;
}

/** Order + items + tracking timeline. Pass userId to scope to a customer. */
export async function getOrderDetail(orderId: string, userId?: string, db: Db = pool) {
  const params: unknown[] = [orderId];
  let scope = '';
  if (userId) {
    params.push(userId);
    scope = 'and user_id = $2';
  }
  const { rows } = await db.query(`select * from orders where id = $1 ${scope}`, params);
  const order = rows[0];
  if (!order) throw notFound('Order not found');
  const items = await db.query('select * from order_items where order_id = $1 order by product_name', [orderId]);
  const history = await db.query(
    `select h.id, h.status, h.note, h.created_at, coalesce(pr.full_name, pr.email) as changed_by_name
     from order_status_history h left join profiles pr on pr.id = h.changed_by
     where h.order_id = $1 order by h.created_at, h.id`,
    [orderId],
  );
  return { ...order, items: items.rows, history: history.rows };
}

/**
 * Checkout. One transaction:
 *  lock the customer's row (serialises concurrent checkouts) → lock products in id order (no deadlocks)
 *  → validate availability → recompute prices server-side → create order + items
 *  → decrement stock + inventory movements → status history → clear cart.
 */
export async function placeOrder(userId: string, input: CheckoutInput) {
  const settings = await getSettings(pool, true);
  if (settings.maintenance_mode) {
    throw new HttpError(503, 'maintenance', 'Checkout is temporarily unavailable. Please try again soon.');
  }
  if (input.payment_method === 'razorpay' && (!settings.online_payments_enabled || !features.razorpay)) {
    throw badRequest('Online payment is not available right now. Please choose Cash on Delivery.');
  }
  if (input.payment_method === 'cod' && !settings.cod_enabled) {
    throw badRequest('Cash on Delivery is not available right now.');
  }

  const order = await withTransaction(async (c) => {
    const profile = (
      await c.query('select id, email, full_name, phone from profiles where id = $1 for update', [userId])
    ).rows[0];
    if (!profile) throw notFound('Account not found');

    const address = (await c.query('select * from addresses where id = $1 and user_id = $2', [input.address_id, userId])).rows[0];
    if (!address) throw notFound('Delivery address not found');

    const cart = (
      await c.query<{ product_id: string; quantity: number }>(
        'select product_id, quantity from cart_items where user_id = $1 order by product_id',
        [userId],
      )
    ).rows;
    if (!cart.length) throw badRequest('Your cart is empty');

    const products = (
      await c.query(
        `select p.id, p.name, p.sku, p.unit, p.price, p.stock_quantity, p.is_active, p.marked_out_of_stock, p.deleted_at,
                (select i.url from product_images i where i.product_id = p.id order by i.sort_order limit 1) as image_url
         from products p where p.id = any($1::uuid[]) order by p.id for update of p`,
        [cart.map((l) => l.product_id)],
      )
    ).rows;
    const byId = new Map(products.map((p) => [p.id as string, p]));

    const problems: { product_id: string; name: string; reason: string; available?: number }[] = [];
    for (const line of cart) {
      const p = byId.get(line.product_id);
      if (!p || p.deleted_at || !p.is_active) {
        problems.push({ product_id: line.product_id, name: p?.name ?? 'Unavailable product', reason: 'unavailable' });
      } else if (p.marked_out_of_stock || p.stock_quantity <= 0) {
        problems.push({ product_id: p.id, name: p.name, reason: 'out_of_stock' });
      } else if (p.stock_quantity < line.quantity) {
        problems.push({ product_id: p.id, name: p.name, reason: 'insufficient_stock', available: p.stock_quantity });
      } else if (line.quantity > settings.max_quantity_per_item) {
        problems.push({ product_id: p.id, name: p.name, reason: 'quantity_limit', available: settings.max_quantity_per_item });
      }
    }
    if (problems.length) {
      throw new HttpError(409, 'cart_unavailable', 'Some items in your cart are no longer available in the requested quantity', problems);
    }

    const items = cart.map((line) => {
      const p = byId.get(line.product_id)!;
      return {
        product_id: p.id as string,
        product_name: p.name as string,
        sku: p.sku as string,
        unit: p.unit as string | null,
        image_url: p.image_url as string | null,
        unit_price: p.price as number,
        quantity: line.quantity,
        line_total: round2((p.price as number) * line.quantity),
      };
    });
    const subtotal = round2(items.reduce((s, i) => s + i.line_total, 0));
    const shipping = shippingFor(subtotal, settings);
    const total = round2(subtotal + shipping);
    const itemCount = items.reduce((s, i) => s + i.quantity, 0);

    if (input.payment_method === 'cod' && total > settings.cod_max_order_value) {
      throw badRequest(`Cash on Delivery is available for orders up to ₹${settings.cod_max_order_value}. Please pay online.`);
    }

    const status: OrderStatus = input.payment_method === 'cod' ? 'confirmed' : 'pending_payment';
    const snapshot = {
      full_name: address.full_name,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
    };

    const created = (
      await c.query(
        `insert into orders (user_id, status, payment_method, payment_status, subtotal, shipping_fee, discount, total,
                             item_count, shipping_address, customer_name, customer_email, customer_phone, notes)
         values ($1, $2, $3, 'pending', $4, $5, 0, $6, $7, $8, $9, $10, $11, $12)
         returning *`,
        [
          userId,
          status,
          input.payment_method,
          subtotal,
          shipping,
          total,
          itemCount,
          JSON.stringify(snapshot),
          profile.full_name ?? address.full_name,
          profile.email,
          profile.phone ?? address.phone,
          input.notes ?? null,
        ],
      )
    ).rows[0] as OrderRow;

    for (const item of items) {
      await c.query(
        `insert into order_items (order_id, product_id, product_name, sku, unit, image_url, unit_price, quantity, line_total)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [created.id, item.product_id, item.product_name, item.sku, item.unit, item.image_url, item.unit_price, item.quantity, item.line_total],
      );
      const updated = await c.query<{ stock_quantity: number }>(
        'update products set stock_quantity = stock_quantity - $2 where id = $1 returning stock_quantity',
        [item.product_id, item.quantity],
      );
      await c.query(
        `insert into inventory_movements (product_id, change, stock_after, reason, order_id, actor_id, note)
         values ($1, $2, $3, 'order', $4, $5, $6)`,
        [item.product_id, -item.quantity, updated.rows[0]!.stock_quantity, created.id, userId, `Order ${created.order_number}`],
      );
    }

    await c.query('insert into order_status_history (order_id, status, note, changed_by) values ($1, $2, $3, $4)', [
      created.id,
      status,
      input.payment_method === 'cod' ? 'Order placed — Cash on Delivery' : 'Order created — awaiting online payment',
      userId,
    ]);
    await c.query('delete from cart_items where user_id = $1', [userId]);
    return created;
  });

  let razorpay = null;
  if (order.payment_method === 'razorpay') {
    try {
      razorpay = await ensureRazorpayOrder(order);
    } catch (err) {
      // Order (and stock reservation) stays; customer can retry payment via POST /me/orders/:id/pay.
      console.error('[checkout] razorpay order creation failed', err);
    }
  }
  return { order: await getOrderDetail(order.id, userId), razorpay };
}

export async function ensureRazorpayOrder(order: Pick<OrderRow, 'id' | 'order_number' | 'total' | 'razorpay_order_id'>) {
  const amount = Math.round(order.total * 100);
  if (order.razorpay_order_id) {
    return { key_id: env.RAZORPAY_KEY_ID!, order_id: order.razorpay_order_id, amount, currency: 'INR' };
  }
  const rp = await createRazorpayOrder(amount, order.order_number, { uru_order_id: order.id });
  await pool.query('update orders set razorpay_order_id = $2 where id = $1 and razorpay_order_id is null', [order.id, rp.id]);
  return { key_id: env.RAZORPAY_KEY_ID!, order_id: rp.id, amount: rp.amount, currency: rp.currency };
}

/** Returns stock for every line, records movements, marks the order cancelled. Caller must hold the order row lock. */
async function cancelInTx(c: Tx, order: OrderRow, actorId: string | null, reason: string) {
  const items = (
    await c.query<{ product_id: string; quantity: number }>(
      'select product_id, quantity from order_items where order_id = $1 and product_id is not null order by product_id',
      [order.id],
    )
  ).rows;
  for (const item of items) {
    const updated = await c.query<{ stock_quantity: number }>(
      'update products set stock_quantity = stock_quantity + $2 where id = $1 returning stock_quantity',
      [item.product_id, item.quantity],
    );
    if (updated.rowCount) {
      await c.query(
        `insert into inventory_movements (product_id, change, stock_after, reason, order_id, actor_id, note)
         values ($1, $2, $3, 'order_cancelled', $4, $5, $6)`,
        [item.product_id, item.quantity, updated.rows[0]!.stock_quantity, order.id, actorId, `Order ${order.order_number} cancelled`],
      );
    }
  }
  await c.query(
    `update orders set status = 'cancelled', cancelled_at = now(), cancel_reason = $2,
       payment_status = case when payment_status = 'paid' then 'refund_pending'::payment_status else payment_status end
     where id = $1`,
    [order.id, reason],
  );
  await c.query('insert into order_status_history (order_id, status, note, changed_by) values ($1, $2, $3, $4)', [
    order.id,
    'cancelled',
    reason,
    actorId,
  ]);
}

/** Staff status change with transition rules. Cancelling restocks atomically. */
export async function transitionOrder(orderId: string, next: OrderStatus, actorId: string, note?: string | null) {
  return withTransaction(async (c) => {
    const order = (await c.query('select * from orders where id = $1 for update', [orderId])).rows[0] as OrderRow | undefined;
    if (!order) throw notFound('Order not found');
    if (order.status === next) throw badRequest(`Order is already "${ORDER_STATUS_LABELS[next]}"`);
    if (!ORDER_TRANSITIONS[order.status].includes(next)) {
      throw badRequest(`Cannot move an order from "${ORDER_STATUS_LABELS[order.status]}" to "${ORDER_STATUS_LABELS[next]}"`);
    }
    if (next === 'cancelled') {
      await cancelInTx(c, order, actorId, note?.trim() || 'Cancelled by store');
    } else {
      await c.query(
        `update orders set status = $2::order_status,
           delivered_at = case when $2::order_status = 'delivered' then now() else delivered_at end,
           payment_status = case when $2::order_status = 'delivered' and payment_method = 'cod' then 'paid'::payment_status else payment_status end,
           paid_at = case when $2::order_status = 'delivered' and payment_method = 'cod' then now() else paid_at end
         where id = $1`,
        [orderId, next],
      );
      await c.query('insert into order_status_history (order_id, status, note, changed_by) values ($1, $2, $3, $4)', [
        orderId,
        next,
        note?.trim() || null,
        actorId,
      ]);
    }
    return { before: order, after: await getOrderDetail(orderId, undefined, c) };
  });
}

export async function cancelOrderByCustomer(orderId: string, userId: string, reason?: string | null) {
  await withTransaction(async (c) => {
    const order = (await c.query('select * from orders where id = $1 and user_id = $2 for update', [orderId, userId])).rows[0] as
      | OrderRow
      | undefined;
    if (!order) throw notFound('Order not found');
    if (order.status !== 'pending_payment' && order.status !== 'confirmed') {
      throw conflict('This order can no longer be cancelled. Please contact support.');
    }
    await cancelInTx(c, order, userId, reason?.trim() || 'Cancelled by customer');
  });
  return getOrderDetail(orderId, userId);
}

/** Marks a Razorpay order paid (idempotent). Used by client verification and the webhook. */
export async function markRazorpayPaid(razorpayOrderId: string, paymentId: string, actorId: string | null, userId?: string) {
  return withTransaction(async (c) => {
    const params: unknown[] = [razorpayOrderId];
    let scope = '';
    if (userId) {
      params.push(userId);
      scope = 'and user_id = $2';
    }
    const order = (await c.query(`select * from orders where razorpay_order_id = $1 ${scope} for update`, params)).rows[0] as
      | OrderRow
      | undefined;
    if (!order) throw notFound('Order not found');
    if (order.payment_status === 'paid' || order.payment_status === 'refund_pending') return order.id;

    if (order.status === 'pending_payment') {
      await c.query(
        `update orders set payment_status = 'paid', paid_at = now(), status = 'confirmed', razorpay_payment_id = $2 where id = $1`,
        [order.id, paymentId],
      );
      await c.query('insert into order_status_history (order_id, status, note, changed_by) values ($1, $2, $3, $4)', [
        order.id,
        'confirmed',
        'Payment received via Razorpay',
        actorId,
      ]);
    } else {
      // Paid after the reservation expired/cancelled → flag for refund; never silently keep money.
      await c.query(`update orders set payment_status = 'refund_pending', razorpay_payment_id = $2 where id = $1`, [order.id, paymentId]);
      await c.query('insert into order_status_history (order_id, status, note, changed_by) values ($1, $2, $3, $4)', [
        order.id,
        order.status,
        'Payment received after the order was cancelled — refund required',
        actorId,
      ]);
    }
    return order.id;
  });
}

/** Cancels unpaid online orders older than the configured timeout and releases their stock. */
export async function releaseExpiredPayments(): Promise<number> {
  const settings = await getSettings(pool, true);
  const { rows } = await pool.query<{ id: string }>(
    `select id from orders where status = 'pending_payment' and placed_at < now() - make_interval(mins => $1) limit 50`,
    [settings.payment_timeout_minutes],
  );
  let released = 0;
  for (const { id } of rows) {
    const done = await withTransaction(async (c) => {
      const order = (
        await c.query(`select * from orders where id = $1 and status = 'pending_payment' for update skip locked`, [id])
      ).rows[0] as OrderRow | undefined;
      if (!order) return false;
      await cancelInTx(c, order, null, 'Payment not completed in time — cancelled automatically');
      return true;
    });
    if (done) released++;
  }
  return released;
}
