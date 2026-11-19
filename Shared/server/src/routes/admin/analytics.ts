import { Router } from 'express';
import { REVENUE_STATUSES } from '@ecommerce/shared';
import { z } from 'zod';
import { pool } from '../../db/pool';
import { parse } from '../../lib/http';
import { ADMIN_PRODUCT_COLUMNS, LOW_STOCK, OUT_OF_STOCK } from '../../lib/sql';
import { requirePermission } from '../../middleware/auth';

export const analyticsRouter = Router();
analyticsRouter.use(requirePermission('analytics.view'));

const TZ = 'Asia/Kolkata';

analyticsRouter.get('/dashboard', async (req, res) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d)).default(30) }), req.query);
  const statuses = [...REVENUE_STATUSES];

  const [totals, byDay, breakdown, top, customers, pending, stock, recent, lowStock] = await Promise.all([
    pool.query(
      `select
         coalesce(sum(total) filter (where created_at >= now() - make_interval(days => $1)), 0) as revenue,
         count(*) filter (where created_at >= now() - make_interval(days => $1))::int as orders,
         coalesce(sum(total) filter (where created_at < now() - make_interval(days => $1)), 0) as revenue_previous,
         count(*) filter (where created_at < now() - make_interval(days => $1))::int as orders_previous
       from orders
       where status = any($2::order_status[]) and created_at >= now() - make_interval(days => $1 * 2)`,
      [days, statuses],
    ),
    pool.query(
      `with d as (
         select generate_series((now() at time zone '${TZ}')::date - ($1::int - 1), (now() at time zone '${TZ}')::date, interval '1 day')::date as day
       )
       select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(sum(o.total), 0) as revenue, count(o.id)::int as orders
       from d left join orders o
         on (o.created_at at time zone '${TZ}')::date = d.day and o.status = any($2::order_status[])
       group by d.day order by d.day`,
      [days, statuses],
    ),
    pool.query(
      `select status, count(*)::int as count from orders where created_at >= now() - make_interval(days => $1)
       group by status order by count desc`,
      [days],
    ),
    pool.query(
      `select oi.product_id, oi.product_name, sum(oi.quantity)::int as quantity, sum(oi.line_total) as revenue
       from order_items oi join orders o on o.id = oi.order_id
       where o.status = any($2::order_status[]) and o.created_at >= now() - make_interval(days => $1)
       group by oi.product_id, oi.product_name order by revenue desc limit 5`,
      [days, statuses],
    ),
    pool.query(`select count(*)::int as n from profiles where role = 'customer' and created_at >= now() - make_interval(days => $1)`, [days]),
    pool.query(`select count(*)::int as n from orders where status in ('confirmed', 'packed')`),
    pool.query(
      `select count(*) filter (where ${LOW_STOCK} and not p.marked_out_of_stock)::int as low,
              count(*) filter (where ${OUT_OF_STOCK})::int as out
       from products p where p.deleted_at is null and p.is_active`,
    ),
    pool.query('select * from orders order by created_at desc limit 6'),
    pool.query(
      `select ${ADMIN_PRODUCT_COLUMNS} from products p left join categories c on c.id = p.category_id
       where p.deleted_at is null and p.is_active and (${OUT_OF_STOCK} or ${LOW_STOCK})
       order by p.stock_quantity asc, p.name limit 6`,
    ),
  ]);

  const t = totals.rows[0];
  res.json({
    range_days: days,
    revenue: t.revenue,
    revenue_previous: t.revenue_previous,
    orders: t.orders,
    orders_previous: t.orders_previous,
    average_order_value: t.orders ? Math.round((t.revenue / t.orders) * 100) / 100 : 0,
    new_customers: customers.rows[0].n,
    pending_fulfilment: pending.rows[0].n,
    low_stock_count: stock.rows[0].low,
    out_of_stock_count: stock.rows[0].out,
    sales_by_day: byDay.rows,
    status_breakdown: breakdown.rows,
    top_products: top.rows,
    recent_orders: recent.rows,
    low_stock: lowStock.rows,
  });
});
