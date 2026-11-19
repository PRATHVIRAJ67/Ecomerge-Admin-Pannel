import { Router, type Request } from 'express';
import {
  addressInput,
  addressUpdateInput,
  cancelOrderInput,
  cartMergeInput,
  cartQuantityInput,
  checkoutInput,
  paginationQuery,
  profileUpdateInput,
  verifyPaymentInput,
} from '@ecommerce/shared';
import { limiter, pool, withTransaction } from '@ecommerce/server';
import { badRequest, conflict, notFound, paginated, parse, uuidParam } from '@ecommerce/server';
import { verifyRazorpayPaymentSignature } from '@ecommerce/server';
import { getSettings } from '@ecommerce/server';
import { productCardColumns } from '@ecommerce/server';
import { loadUserCart } from '../lib/cart';
import {
  cancelOrderByCustomer,
  ensureRazorpayOrder,
  getOrderDetail,
  markRazorpayPaid,
  placeOrder,
} from '@ecommerce/server';

export const accountRouter = Router();
const uid = (req: Request) => req.auth!.userId;

const checkoutLimiter = limiter({ limit: 10 });

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
accountRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'select id, email, full_name, phone, avatar_url, role, status, permissions, last_seen_at, created_at, updated_at from profiles where id = $1',
    [uid(req)],
  );
  await pool.query('update profiles set last_seen_at = now() where id = $1', [uid(req)]);
  res.json(rows[0]);
});

accountRouter.patch('/', async (req, res) => {
  const body = parse(profileUpdateInput, req.body);
  const { rows } = await pool.query(
    `update profiles set full_name = coalesce($2, full_name), phone = case when $3::boolean then $4 else phone end
     where id = $1 returning id, email, full_name, phone, avatar_url, role, status, permissions, created_at, updated_at`,
    [uid(req), body.full_name ?? null, body.phone !== undefined, body.phone ?? null],
  );
  res.json(rows[0]);
});

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------
const ADDRESS_FIELDS = ['label', 'full_name', 'phone', 'line1', 'line2', 'landmark', 'city', 'state', 'pincode'] as const;

accountRouter.get('/addresses', async (req, res) => {
  const { rows } = await pool.query('select * from addresses where user_id = $1 order by is_default desc, created_at desc', [uid(req)]);
  res.json(rows);
});

accountRouter.post('/addresses', async (req, res) => {
  const body = parse(addressInput, req.body);
  const address = await withTransaction(async (c) => {
    const count = (await c.query<{ n: number }>('select count(*)::int as n from addresses where user_id = $1', [uid(req)])).rows[0]!.n;
    if (count >= 20) throw badRequest('You can save up to 20 addresses');
    const makeDefault = Boolean(body.is_default) || count === 0;
    if (makeDefault) await c.query('update addresses set is_default = false where user_id = $1', [uid(req)]);
    const { rows } = await c.query(
      `insert into addresses (user_id, label, full_name, phone, line1, line2, landmark, city, state, pincode, is_default)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
      [uid(req), body.label ?? null, body.full_name, body.phone, body.line1, body.line2 ?? null, body.landmark ?? null, body.city, body.state, body.pincode, makeDefault],
    );
    return rows[0];
  });
  res.status(201).json(address);
});

accountRouter.patch('/addresses/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Address');
  const body = parse(addressUpdateInput, req.body);
  const address = await withTransaction(async (c) => {
    const sets: string[] = [];
    const params: unknown[] = [id, uid(req)];
    for (const field of ADDRESS_FIELDS) {
      if (body[field] !== undefined) {
        params.push(body[field]);
        sets.push(`${field} = $${params.length}`);
      }
    }
    if (body.is_default === true) {
      await c.query('update addresses set is_default = false where user_id = $1 and id <> $2', [uid(req), id]);
      sets.push('is_default = true');
    }
    if (!sets.length) throw badRequest('Nothing to update');
    const { rows } = await c.query(`update addresses set ${sets.join(', ')} where id = $1 and user_id = $2 returning *`, params);
    if (!rows[0]) throw notFound('Address not found');
    return rows[0];
  });
  res.json(address);
});

accountRouter.delete('/addresses/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Address');
  await withTransaction(async (c) => {
    const { rows } = await c.query('delete from addresses where id = $1 and user_id = $2 returning is_default', [id, uid(req)]);
    if (!rows[0]) throw notFound('Address not found');
    if (rows[0].is_default) {
      await c.query(
        `update addresses set is_default = true where id = (select id from addresses where user_id = $1 order by created_at desc limit 1)`,
        [uid(req)],
      );
    }
  });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Cart (server-side → synced across web and mobile)
// ---------------------------------------------------------------------------
const loadCart = loadUserCart;

async function assertPurchasable(productId: string, quantity: number) {
  const s = await getSettings();
  const { rows } = await pool.query(
    'select name, is_active, marked_out_of_stock, stock_quantity from products where id = $1 and deleted_at is null',
    [productId],
  );
  const p = rows[0];
  if (!p || !p.is_active) throw notFound('Product not found');
  if (p.marked_out_of_stock || p.stock_quantity <= 0) throw conflict(`${p.name} is out of stock`);
  const max = Math.min(p.stock_quantity, s.max_quantity_per_item);
  if (quantity > max) throw conflict(`Only ${max} of ${p.name} can be ordered right now`, { max_order_quantity: max });
}

accountRouter.get('/cart', async (req, res) => {
  res.json(await loadCart(uid(req)));
});

accountRouter.put('/cart/:productId', async (req, res) => {
  const productId = uuidParam(req.params.productId, 'Product');
  const { quantity } = parse(cartQuantityInput, req.body);
  if (quantity === 0) {
    await pool.query('delete from cart_items where user_id = $1 and product_id = $2', [uid(req), productId]);
  } else {
    await assertPurchasable(productId, quantity);
    await pool.query(
      `insert into cart_items (user_id, product_id, quantity) values ($1, $2, $3)
       on conflict (user_id, product_id) do update set quantity = excluded.quantity, updated_at = now()`,
      [uid(req), productId, quantity],
    );
  }
  res.json(await loadCart(uid(req)));
});

/** Merge a guest (local) cart into the account after sign-in. Unavailable items are skipped. */
accountRouter.post('/cart/merge', async (req, res) => {
  const { items } = parse(cartMergeInput, req.body);
  const s = await getSettings();
  for (const item of items) {
    await pool.query(
      `insert into cart_items (user_id, product_id, quantity)
       select $1, p.id, least($3::int, p.stock_quantity, $4::int)
       from products p
       where p.id = $2 and p.deleted_at is null and p.is_active and not p.marked_out_of_stock and p.stock_quantity > 0
       on conflict (user_id, product_id) do update
         set quantity = least(greatest(cart_items.quantity, excluded.quantity), $4::int), updated_at = now()`,
      [uid(req), item.product_id, item.quantity, s.max_quantity_per_item],
    );
  }
  res.json(await loadCart(uid(req)));
});

accountRouter.delete('/cart', async (req, res) => {
  await pool.query('delete from cart_items where user_id = $1', [uid(req)]);
  res.json(await loadCart(uid(req)));
});

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------
accountRouter.get('/wishlist', async (req, res) => {
  const s = await getSettings();
  const { rows } = await pool.query(
    `select ${productCardColumns(s.max_quantity_per_item)}, w.created_at as added_at
     from wishlist_items w join products p on p.id = w.product_id left join categories c on c.id = p.category_id
     where w.user_id = $1 and p.deleted_at is null and p.is_active
     order by w.created_at desc`,
    [uid(req)],
  );
  res.json(rows);
});

accountRouter.put('/wishlist/:productId', async (req, res) => {
  const productId = uuidParam(req.params.productId, 'Product');
  const { rowCount } = await pool.query(
    `insert into wishlist_items (user_id, product_id)
     select $1, id from products where id = $2 and deleted_at is null and is_active
     on conflict do nothing`,
    [uid(req), productId],
  );
  if (rowCount === 0) {
    const exists = await pool.query('select 1 from wishlist_items where user_id = $1 and product_id = $2', [uid(req), productId]);
    if (!exists.rowCount) throw notFound('Product not found');
  }
  res.status(204).end();
});

accountRouter.delete('/wishlist/:productId', async (req, res) => {
  const productId = uuidParam(req.params.productId, 'Product');
  await pool.query('delete from wishlist_items where user_id = $1 and product_id = $2', [uid(req), productId]);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Checkout & orders
// ---------------------------------------------------------------------------
accountRouter.post('/checkout', checkoutLimiter, async (req, res) => {
  const body = parse(checkoutInput, req.body);
  res.status(201).json(await placeOrder(uid(req), body));
});

accountRouter.get('/orders', async (req, res) => {
  const q = parse(paginationQuery, req.query);
  const { rows } = await pool.query(
    `select o.*, count(*) over() as total_count,
       (select coalesce(json_agg(json_build_object('product_name', oi.product_name, 'image_url', oi.image_url, 'quantity', oi.quantity)), '[]'::json)
        from order_items oi where oi.order_id = o.id) as items
     from orders o where o.user_id = $1 order by o.created_at desc limit $2 offset $3`,
    [uid(req), q.limit, (q.page - 1) * q.limit],
  );
  res.json(paginated(rows, q.page, q.limit));
});

accountRouter.get('/orders/:id', async (req, res) => {
  res.json(await getOrderDetail(uuidParam(req.params.id, 'Order'), uid(req)));
});

accountRouter.post('/orders/:id/cancel', async (req, res) => {
  const { reason } = parse(cancelOrderInput, req.body ?? {});
  res.json(await cancelOrderByCustomer(uuidParam(req.params.id, 'Order'), uid(req), reason));
});

/** (Re)start online payment for an order awaiting payment. */
accountRouter.post('/orders/:id/pay', checkoutLimiter, async (req, res) => {
  const id = uuidParam(req.params.id, 'Order');
  const order = (await pool.query('select * from orders where id = $1 and user_id = $2', [id, uid(req)])).rows[0];
  if (!order) throw notFound('Order not found');
  if (order.payment_method !== 'razorpay' || order.status !== 'pending_payment') {
    throw conflict('This order is not awaiting online payment');
  }
  res.json({ razorpay: await ensureRazorpayOrder(order) });
});

accountRouter.post('/orders/:id/verify-payment', async (req, res) => {
  const id = uuidParam(req.params.id, 'Order');
  const body = parse(verifyPaymentInput, req.body);
  const order = (await pool.query('select razorpay_order_id from orders where id = $1 and user_id = $2', [id, uid(req)])).rows[0];
  if (!order) throw notFound('Order not found');
  if (order.razorpay_order_id !== body.razorpay_order_id) throw badRequest('Payment does not match this order');
  if (!verifyRazorpayPaymentSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
    throw badRequest('Payment verification failed. If money was debited it will be refunded automatically.');
  }
  await markRazorpayPaid(body.razorpay_order_id, body.razorpay_payment_id, uid(req), uid(req));
  res.json(await getOrderDetail(id, uid(req)));
});
