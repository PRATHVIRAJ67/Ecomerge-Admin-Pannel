import { Router } from 'express';
import { z } from 'zod';
import { catalogProductsQuery, cartMergeInput } from '@ecommerce/shared';
import { features, limiter, pool } from '@ecommerce/server';
import { notFound, paginated, parse, SqlParams } from '@ecommerce/server';
import { getPublicSettings, getSettings } from '@ecommerce/server';
import { LIVE_BANNER, productCardColumns } from '@ecommerce/server';
import { buildCartSummary } from '../lib/cart';

export const catalogRouter = Router();

const PRODUCT_FROM = `from products p left join categories c on c.id = p.category_id
  where p.deleted_at is null and p.is_active and (c.id is null or c.is_active)`;

const CATEGORY_SQL = `select c.id, c.parent_id, c.name, c.slug, c.description, c.image_url, c.sort_order, c.is_active, c.created_at, c.updated_at,
    (select count(*) from products p where p.category_id = c.id and p.is_active and p.deleted_at is null)::int as product_count
  from categories c where c.is_active order by c.sort_order, c.name`;

/** Public settings + whether online payment can actually be taken (keys configured AND enabled). */
async function storefrontSettings() {
  const settings = await getPublicSettings();
  return { ...settings, online_payments_available: features.razorpay && settings.online_payments_enabled !== false };
}

/** Units sold per product (non-cancelled orders), optionally within the last N days. */
const soldSince = (days: number | null) => `(select coalesce(sum(oi.quantity), 0) from order_items oi join orders o on o.id = oi.order_id
  where oi.product_id = p.id and o.status <> 'cancelled'${days ? ` and o.placed_at > now() - interval '${days} days'` : ''})`;

catalogRouter.get('/settings', async (_req, res) => {
  res.json(await storefrontSettings());
});

catalogRouter.get('/home', async (_req, res) => {
  const s = await getSettings();
  const cols = productCardColumns(s.max_quantity_per_item);
  const [banners, categories, featured, latest, bestSellers, trending, settings] = await Promise.all([
    pool.query(`select * from banners where ${LIVE_BANNER} order by placement, sort_order, created_at desc`),
    pool.query(CATEGORY_SQL),
    pool.query(`select ${cols} ${PRODUCT_FROM} and p.is_featured order by in_stock desc, p.updated_at desc limit 12`),
    pool.query(`select ${cols} ${PRODUCT_FROM} order by in_stock desc, p.created_at desc limit 12`),
    // Best sellers: all-time units sold; ties broken by the merchant's 'bestseller' tag, then featured.
    pool.query(
      `select ${cols} ${PRODUCT_FROM}
       order by in_stock desc, ${soldSince(null)} desc, ('bestseller' = any(p.tags)) desc, p.is_featured desc, p.created_at desc limit 12`,
    ),
    // Trending: units sold + wishlist adds in the last 14 days; ties broken by most recently updated.
    pool.query(
      `select ${cols} ${PRODUCT_FROM}
       order by in_stock desc,
         (${soldSince(14)} * 3 + (select count(*) from wishlist_items w where w.product_id = p.id and w.created_at > now() - interval '14 days')) desc,
         ('trending' = any(p.tags)) desc, p.updated_at desc limit 12`,
    ),
    storefrontSettings(),
  ]);
  res.json({
    banners: banners.rows,
    categories: categories.rows,
    featured: featured.rows,
    trending: trending.rows,
    best_sellers: bestSellers.rows,
    new_arrivals: latest.rows,
    settings,
  });
});

catalogRouter.get('/categories', async (_req, res) => {
  res.json((await pool.query(CATEGORY_SQL)).rows);
});

catalogRouter.get('/banners', async (req, res) => {
  const placement = typeof req.query.placement === 'string' ? req.query.placement : null;
  const { rows } = await pool.query(
    `select * from banners where ${LIVE_BANNER} and ($1::text is null or placement = $1) order by sort_order, created_at desc`,
    [placement],
  );
  res.json(rows);
});

catalogRouter.get('/products', async (req, res) => {
  const q = parse(catalogProductsQuery, req.query);
  const s = await getSettings();
  const sql = new SqlParams();
  const where: string[] = [];

  if (q.q) {
    const like = sql.add(`%${q.q}%`);
    const tag = sql.add(q.q.toLowerCase());
    where.push(`(p.name ilike ${like} or p.short_description ilike ${like} or p.origin ilike ${like} or c.name ilike ${like} or ${tag} = any(p.tags))`);
  }
  if (q.category) {
    const slug = sql.add(q.category);
    where.push(`(c.slug = ${slug} or c.parent_id = (select id from categories where slug = ${slug}))`);
  }
  if (q.featured === 'true') where.push('p.is_featured');
  if (q.in_stock === 'true') where.push('(not p.marked_out_of_stock and p.stock_quantity > 0)');
  if (q.min_price != null) where.push(`p.price >= ${sql.add(q.min_price)}`);
  if (q.max_price != null) where.push(`p.price <= ${sql.add(q.max_price)}`);

  let orderBy: string;
  switch (q.sort) {
    case 'newest':
      orderBy = 'p.created_at desc';
      break;
    case 'price_asc':
      orderBy = 'p.price asc';
      break;
    case 'price_desc':
      orderBy = 'p.price desc';
      break;
    case 'name':
      orderBy = 'p.name asc';
      break;
    case 'popular':
      orderBy = '(select coalesce(sum(oi.quantity), 0) from order_items oi where oi.product_id = p.id) desc';
      break;
    default:
      orderBy = q.q ? `similarity(p.name, ${sql.add(q.q)}) desc, p.is_featured desc` : 'p.is_featured desc, p.created_at desc';
  }

  const limit = sql.add(q.limit);
  const offset = sql.add((q.page - 1) * q.limit);
  const { rows } = await pool.query(
    `select ${productCardColumns(s.max_quantity_per_item)}, count(*) over() as total_count
     ${PRODUCT_FROM} ${where.length ? `and ${where.join(' and ')}` : ''}
     order by in_stock desc, ${orderBy}, p.id
     limit ${limit} offset ${offset}`,
    sql.values,
  );
  res.json(paginated(rows, q.page, q.limit));
});

catalogRouter.get('/products/:slug', async (req, res) => {
  const s = await getSettings();
  const cols = productCardColumns(s.max_quantity_per_item);
  const { rows } = await pool.query(`select ${cols}, p.description ${PRODUCT_FROM} and p.slug = $1`, [req.params.slug]);
  const product = rows[0];
  if (!product) throw notFound('Product not found');
  const related = await pool.query(
    `select ${cols} ${PRODUCT_FROM} and p.id <> $1 and p.category_id is not distinct from $2
     order by in_stock desc, p.is_featured desc, p.created_at desc limit 8`,
    [product.id, product.category_id],
  );
  res.json({ ...product, related: related.rows });
});

/** Product cards by id — used by the guest wishlist (stored locally until sign-in). */
const lookupQuery = z.object({
  ids: z
    .string()
    .max(40 * 50)
    .transform((v) => v.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).max(50)),
});

catalogRouter.get('/products-lookup', async (req, res) => {
  const { ids } = parse(lookupQuery, req.query);
  if (!ids.length) {
    res.json([]);
    return;
  }
  const s = await getSettings();
  const { rows } = await pool.query(`select ${productCardColumns(s.max_quantity_per_item)} ${PRODUCT_FROM} and p.id = any($1::uuid[])`, [ids]);
  res.json(rows);
});

/** Guest cart preview: live prices, availability and shipping computed on the server. Read-only. */
const previewLimiter = limiter({ limit: 120 });
catalogRouter.post('/cart-preview', previewLimiter, async (req, res) => {
  const { items } = parse(cartMergeInput, req.body ?? {});
  const merged = new Map<string, number>();
  for (const i of items) merged.set(i.product_id, Math.max(merged.get(i.product_id) ?? 0, i.quantity));
  res.json(await buildCartSummary([...merged].map(([product_id, quantity]) => ({ product_id, quantity }))));
});
