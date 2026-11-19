import { Router } from 'express';
import { adminOrdersQuery, orderStatusUpdateInput, paginationQuery, REVENUE_STATUSES } from '@ecommerce/shared';
import { z } from 'zod';
import { pool } from '../../db/pool';
import { audit } from '../../lib/audit';
import { notFound, paginated, parse, SqlParams, uuidParam } from '../../lib/http';
import { ADMIN_PRODUCT_COLUMNS, LOW_STOCK, OUT_OF_STOCK } from '../../lib/sql';
import { requirePermission } from '../../middleware/auth';
import { getOrderDetail, transitionOrder } from '../../services/orders';

// ===========================================================================
// Inventory reports
// ===========================================================================
export const inventoryRouter = Router();
inventoryRouter.use(requirePermission('inventory.manage', 'analytics.view'));

inventoryRouter.get('/report', async (_req, res) => {
  const [summary, attention] = await Promise.all([
    pool.query(
      `select count(*)::int as total_products,
         coalesce(sum(p.stock_quantity), 0)::int as total_units,
         coalesce(sum(p.stock_quantity * p.price), 0) as stock_value,
         count(*) filter (where ${LOW_STOCK} and not p.marked_out_of_stock)::int as low_stock_count,
         count(*) filter (where p.stock_quantity = 0)::int as out_of_stock_count,
         count(*) filter (where p.marked_out_of_stock)::int as marked_out_of_stock_count
       from products p where p.deleted_at is null`,
    ),
    pool.query(
      `select ${ADMIN_PRODUCT_COLUMNS} from products p left join categories c on c.id = p.category_id
       where p.deleted_at is null and (${OUT_OF_STOCK} or ${LOW_STOCK})
       order by p.stock_quantity asc, p.name limit 100`,
    ),
  ]);
  res.json({ summary: summary.rows[0], attention: attention.rows });
});

const movementsQuery = paginationQuery.extend({
  product_id: z.string().uuid().optional(),
  reason: z.enum(['initial', 'order', 'order_cancelled', 'restock', 'adjustment', 'correction']).optional(),
});

inventoryRouter.get('/movements', async (req, res) => {
  const q = parse(movementsQuery, req.query);
  const sql = new SqlParams();
  const where: string[] = ['true'];
  if (q.product_id) where.push(`m.product_id = ${sql.add(q.product_id)}`);
  if (q.reason) where.push(`m.reason = ${sql.add(q.reason)}`);
  const { rows } = await pool.query(
    `select m.id, m.product_id, p.name as product_name, p.sku, m.change, m.stock_after, m.reason, m.note, m.order_id,
            o.order_number, pr.email as actor_email, m.created_at, count(*) over() as total_count
     from inventory_movements m
     join products p on p.id = m.product_id
     left join orders o on o.id = m.order_id
     left join profiles pr on pr.id = m.actor_id
     where ${where.join(' and ')}
     order by m.created_at desc, m.id desc
     limit ${sql.add(q.limit)} offset ${sql.add((q.page - 1) * q.limit)}`,
    sql.values,
  );
  res.json(paginated(rows, q.page, q.limit));
});

// ===========================================================================
// Orders
// ===========================================================================
export const ordersRouter = Router();
ordersRouter.use(requirePermission('orders.manage'));

ordersRouter.get('/', async (req, res) => {
  const q = parse(adminOrdersQuery, req.query);
  const sql = new SqlParams();
  const base: string[] = ['true'];
  if (q.q) {
    const like = sql.add(`%${q.q}%`);
    base.push(`(o.order_number ilike ${like} or o.customer_name ilike ${like} or o.customer_email ilike ${like} or o.customer_phone ilike ${like})`);
  }
  if (q.payment_method) base.push(`o.payment_method = ${sql.add(q.payment_method)}`);
  const baseParams = [...sql.values];
  const where = [...base];
  if (q.status) where.push(`o.status = ${sql.add(q.status)}`);

  const [list, counts] = await Promise.all([
    pool.query(
      `select o.*, count(*) over() as total_count from orders o where ${where.join(' and ')}
       order by o.created_at desc limit ${sql.add(q.limit)} offset ${sql.add((q.page - 1) * q.limit)}`,
      sql.values,
    ),
    pool.query(`select o.status, count(*)::int as count from orders o where ${base.join(' and ')} group by o.status`, baseParams),
  ]);
  res.json({ ...paginated(list.rows, q.page, q.limit), counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.count])) });
});

ordersRouter.get('/:id', async (req, res) => {
  res.json(await getOrderDetail(uuidParam(req.params.id, 'Order')));
});

ordersRouter.patch('/:id/status', async (req, res) => {
  const id = uuidParam(req.params.id, 'Order');
  const body = parse(orderStatusUpdateInput, req.body);
  const { before, after } = await transitionOrder(id, body.status, req.auth!.userId, body.note);
  await audit(pool, req, {
    action: 'order.status_change',
    entityType: 'order',
    entityId: id,
    before: { status: before.status },
    after: { status: after.status, note: body.note ?? null },
  });
  res.json(after);
});

// ===========================================================================
// Customers
// ===========================================================================
export const customersRouter = Router();
customersRouter.use(requirePermission('customers.view'));

const CUSTOMER_COLUMNS = `pr.id, pr.email, pr.full_name, pr.phone, pr.status, pr.created_at,
  (select count(*) from orders o where o.user_id = pr.id)::int as order_count,
  (select coalesce(sum(o.total), 0) from orders o where o.user_id = pr.id and o.status = any($1::order_status[])) as total_spent,
  (select max(o.created_at) from orders o where o.user_id = pr.id) as last_order_at`;

customersRouter.get('/', async (req, res) => {
  const q = parse(paginationQuery.extend({ q: z.string().trim().max(100).optional() }), req.query);
  const sql = new SqlParams();
  sql.add(REVENUE_STATUSES);
  const where = [`pr.role = 'customer'`];
  if (q.q) {
    const like = sql.add(`%${q.q}%`);
    where.push(`(pr.email ilike ${like} or pr.full_name ilike ${like} or pr.phone ilike ${like})`);
  }
  const { rows } = await pool.query(
    `select ${CUSTOMER_COLUMNS}, count(*) over() as total_count from profiles pr
     where ${where.join(' and ')} order by pr.created_at desc
     limit ${sql.add(q.limit)} offset ${sql.add((q.page - 1) * q.limit)}`,
    sql.values,
  );
  res.json(paginated(rows, q.page, q.limit));
});

customersRouter.get('/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Customer');
  const { rows } = await pool.query(`select ${CUSTOMER_COLUMNS} from profiles pr where pr.id = $2 and pr.role = 'customer'`, [REVENUE_STATUSES, id]);
  if (!rows[0]) throw notFound('Customer not found');
  const [addresses, orders] = await Promise.all([
    pool.query('select * from addresses where user_id = $1 order by is_default desc, created_at desc', [id]),
    pool.query('select * from orders where user_id = $1 order by created_at desc limit 50', [id]),
  ]);
  res.json({ ...rows[0], addresses: addresses.rows, orders: orders.rows });
});
