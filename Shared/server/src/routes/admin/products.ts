import { randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import {
  adminProductsQuery,
  availabilityInput,
  priceUpdateInput,
  productCreateInput,
  productUpdateInput,
  slugify,
  stockUpdateInput,
} from '@ecommerce/shared';
import { pool, withTransaction, type Db, type Tx } from '../../db/pool';
import { audit } from '../../lib/audit';
import { badRequest, conflict, forbidden, notFound, paginated, parse, SqlParams, uuidParam } from '../../lib/http';
import { ADMIN_PRODUCT_COLUMNS, LOW_STOCK, OUT_OF_STOCK } from '../../lib/sql';
import { can, requirePermission } from '../../middleware/auth';

export const productsRouter = Router();
const uid = (req: Request) => req.auth!.userId;
const anyCatalogPermission = requirePermission('products.manage', 'prices.manage', 'inventory.manage');

export async function getAdminProduct(db: Db, id: string, lock = false) {
  const { rows } = await db.query(
    `select ${ADMIN_PRODUCT_COLUMNS} from products p left join categories c on c.id = p.category_id
     where p.id = $1 and p.deleted_at is null ${lock ? 'for update of p' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

const suffix = () => randomBytes(3).toString('hex');

async function uniqueSlug(db: Db, base: string, excludeId: string | null = null): Promise<string> {
  const root = base || `product-${suffix()}`;
  let candidate = root;
  for (let i = 0; i < 6; i++) {
    const { rowCount } = await db.query(
      'select 1 from products where slug = $1 and deleted_at is null and ($2::uuid is null or id <> $2)',
      [candidate, excludeId],
    );
    if (!rowCount) return candidate;
    candidate = `${root}-${suffix()}`;
  }
  throw conflict('Could not generate a unique slug — please enter one');
}

async function replaceImages(c: Tx, productId: string, images: { url: string; alt?: string | null; storage_key?: string | null }[]) {
  await c.query('delete from product_images where product_id = $1', [productId]);
  for (const [index, img] of images.entries()) {
    await c.query('insert into product_images (product_id, url, alt, storage_key, sort_order) values ($1, $2, $3, $4, $5)', [
      productId,
      img.url,
      img.alt ?? null,
      img.storage_key ?? null,
      index,
    ]);
  }
}

async function assertCategory(db: Db, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const { rowCount } = await db.query('select 1 from categories where id = $1', [categoryId]);
  if (!rowCount) throw badRequest('Selected category does not exist');
}

// ---------------------------------------------------------------------------
// List with filters + per-status counts (for tabs)
// ---------------------------------------------------------------------------
productsRouter.get('/', anyCatalogPermission, async (req, res) => {
  const q = parse(adminProductsQuery, req.query);
  const sql = new SqlParams();
  const base: string[] = ['p.deleted_at is null'];
  if (q.q) {
    const like = sql.add(`%${q.q}%`);
    base.push(`(p.name ilike ${like} or p.sku ilike ${like} or p.origin ilike ${like})`);
  }
  if (q.category_id) base.push(`p.category_id = ${sql.add(q.category_id)}`);

  const statusFilter: Record<typeof q.status, string | null> = {
    all: null,
    active: 'p.is_active',
    draft: 'not p.is_active',
    low_stock: `(${LOW_STOCK} and not p.marked_out_of_stock)`,
    out_of_stock: OUT_OF_STOCK,
    featured: 'p.is_featured',
  };
  const where = [...base];
  const status = statusFilter[q.status];
  if (status) where.push(status);

  const sort: Record<typeof q.sort, string> = {
    updated: 'p.updated_at desc',
    newest: 'p.created_at desc',
    name: 'p.name asc',
    price_asc: 'p.price asc',
    price_desc: 'p.price desc',
    stock_asc: 'p.stock_quantity asc',
    stock_desc: 'p.stock_quantity desc',
  };

  const baseParams = [...sql.values];
  const limit = sql.add(q.limit);
  const offset = sql.add((q.page - 1) * q.limit);
  const [list, counts] = await Promise.all([
    pool.query(
      `select ${ADMIN_PRODUCT_COLUMNS}, count(*) over() as total_count
       from products p left join categories c on c.id = p.category_id
       where ${where.join(' and ')}
       order by ${sort[q.sort]}, p.id limit ${limit} offset ${offset}`,
      sql.values,
    ),
    pool.query(
      `select count(*)::int as all,
         count(*) filter (where p.is_active)::int as active,
         count(*) filter (where not p.is_active)::int as draft,
         count(*) filter (where ${LOW_STOCK} and not p.marked_out_of_stock)::int as low_stock,
         count(*) filter (where ${OUT_OF_STOCK})::int as out_of_stock,
         count(*) filter (where p.is_featured)::int as featured
       from products p where ${base.join(' and ')}`,
      baseParams,
    ),
  ]);
  res.json({ ...paginated(list.rows, q.page, q.limit), counts: counts.rows[0] });
});

productsRouter.get('/:id', anyCatalogPermission, async (req, res) => {
  const product = await getAdminProduct(pool, uuidParam(req.params.id, 'Product'));
  if (!product) throw notFound('Product not found');
  res.json(product);
});

productsRouter.get('/:id/price-history', requirePermission('prices.manage', 'products.manage'), async (req, res) => {
  const { rows } = await pool.query(
    `select h.id, h.old_price, h.new_price, h.old_mrp, h.new_mrp, h.created_at, pr.email as changed_by_email
     from price_history h left join profiles pr on pr.id = h.changed_by
     where h.product_id = $1 order by h.created_at desc limit 50`,
    [uuidParam(req.params.id, 'Product')],
  );
  res.json(rows);
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
productsRouter.post('/', requirePermission('products.manage'), async (req, res) => {
  const body = parse(productCreateInput, req.body);
  const product = await withTransaction(async (c) => {
    await assertCategory(c, body.category_id);
    const slug = body.slug ? body.slug : await uniqueSlug(c, slugify(body.name));
    const sku = (body.sku ?? `URU-${suffix().toUpperCase()}`).toUpperCase();
    const stock = body.stock_quantity ?? 0;
    const { rows } = await c.query<{ id: string }>(
      `insert into products (category_id, name, slug, sku, short_description, description, unit, origin, tags, price, mrp,
                             stock_quantity, low_stock_threshold, is_active, is_featured, marked_out_of_stock, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17) returning id`,
      [
        body.category_id ?? null,
        body.name,
        slug,
        sku,
        body.short_description ?? null,
        body.description ?? null,
        body.unit ?? null,
        body.origin ?? null,
        body.tags ?? [],
        body.price,
        body.mrp ?? null,
        stock,
        body.low_stock_threshold ?? 5,
        body.is_active ?? true,
        body.is_featured ?? false,
        body.marked_out_of_stock ?? false,
        uid(req),
      ],
    );
    const id = rows[0]!.id;
    await replaceImages(c, id, body.images ?? []);
    if (stock > 0) {
      await c.query(
        `insert into inventory_movements (product_id, change, stock_after, reason, actor_id, note) values ($1, $2, $2, 'initial', $3, 'Initial stock')`,
        [id, stock, uid(req)],
      );
    }
    const created = await getAdminProduct(c, id);
    await audit(c, req, { action: 'product.create', entityType: 'product', entityId: id, after: created });
    return created;
  });
  res.status(201).json(product);
});

// ---------------------------------------------------------------------------
// Update (field groups gated by permission). Stock changes use POST /:id/stock.
// ---------------------------------------------------------------------------
const CATALOG_FIELDS = ['name', 'slug', 'sku', 'category_id', 'short_description', 'description', 'unit', 'origin', 'tags', 'low_stock_threshold', 'is_active', 'is_featured'] as const;
const PRICE_FIELDS = ['price', 'mrp'] as const;

productsRouter.patch('/:id', anyCatalogPermission, async (req, res) => {
  const id = uuidParam(req.params.id, 'Product');
  const body = parse(productUpdateInput, req.body);

  const touches = (fields: readonly string[]) => fields.some((f) => (body as Record<string, unknown>)[f] !== undefined);
  if ((touches(CATALOG_FIELDS) || body.images !== undefined) && !can(req, 'products.manage')) throw forbidden('You need the Products permission to edit product details');
  if (touches(PRICE_FIELDS) && !can(req, 'prices.manage')) throw forbidden('You need the Pricing permission to change prices');
  if (body.marked_out_of_stock !== undefined && !can(req, 'inventory.manage')) throw forbidden('You need the Inventory permission to change availability');

  const product = await withTransaction(async (c) => {
    const before = await getAdminProduct(c, id, true);
    if (!before) throw notFound('Product not found');
    if (body.category_id !== undefined) await assertCategory(c, body.category_id);

    const sets: string[] = [];
    const params: unknown[] = [id];
    const set = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    for (const field of [...CATALOG_FIELDS, ...PRICE_FIELDS, 'marked_out_of_stock'] as const) {
      const value = body[field];
      if (value === undefined) continue;
      set(field, field === 'sku' && typeof value === 'string' ? value.toUpperCase() : value);
    }
    if (sets.length) {
      set('updated_by', uid(req));
      await c.query(`update products set ${sets.join(', ')} where id = $1`, params);
    }
    if (body.images !== undefined) await replaceImages(c, id, body.images);
    if (!sets.length && body.images === undefined) throw badRequest('Nothing to update');

    const after = await getAdminProduct(c, id);
    await audit(c, req, { action: 'product.update', entityType: 'product', entityId: id, before, after });
    return after;
  });
  res.json(product);
});

productsRouter.patch('/:id/price', requirePermission('prices.manage'), async (req, res) => {
  const id = uuidParam(req.params.id, 'Product');
  const body = parse(priceUpdateInput, req.body);
  const product = await withTransaction(async (c) => {
    const before = await getAdminProduct(c, id, true);
    if (!before) throw notFound('Product not found');
    const mrp = body.mrp === undefined ? before.mrp : body.mrp;
    if (mrp != null && mrp < body.price) throw badRequest(`MRP (₹${mrp}) must be at least the selling price`);
    await c.query('update products set price = $2, mrp = $3, updated_by = $4 where id = $1', [id, body.price, mrp, uid(req)]);
    const after = await getAdminProduct(c, id);
    await audit(c, req, {
      action: 'product.price_change',
      entityType: 'product',
      entityId: id,
      before: { price: before.price, mrp: before.mrp },
      after: { price: after.price, mrp: after.mrp },
    });
    return after;
  });
  res.json(product);
});

productsRouter.post('/:id/stock', requirePermission('inventory.manage'), async (req, res) => {
  const id = uuidParam(req.params.id, 'Product');
  const body = parse(stockUpdateInput, req.body);
  const product = await withTransaction(async (c) => {
    const row = (await c.query<{ stock_quantity: number }>('select stock_quantity from products where id = $1 and deleted_at is null for update', [id])).rows[0];
    if (!row) throw notFound('Product not found');
    if (body.mode === 'set' && body.quantity < 0) throw badRequest('Stock cannot be negative');
    const next = body.mode === 'set' ? body.quantity : row.stock_quantity + body.quantity;
    if (next < 0) throw badRequest(`Stock cannot go below zero (current stock: ${row.stock_quantity})`);
    const change = next - row.stock_quantity;
    if (change !== 0) {
      await c.query('update products set stock_quantity = $2, updated_by = $3 where id = $1', [id, next, uid(req)]);
      await c.query(
        'insert into inventory_movements (product_id, change, stock_after, reason, note, actor_id) values ($1, $2, $3, $4, $5, $6)',
        [id, change, next, body.reason, body.note ?? null, uid(req)],
      );
      await audit(c, req, {
        action: 'product.stock_change',
        entityType: 'product',
        entityId: id,
        before: { stock_quantity: row.stock_quantity },
        after: { stock_quantity: next, reason: body.reason, note: body.note ?? null },
      });
    }
    return getAdminProduct(c, id);
  });
  res.json(product);
});

productsRouter.patch('/:id/availability', requirePermission('inventory.manage'), async (req, res) => {
  const id = uuidParam(req.params.id, 'Product');
  const { marked_out_of_stock } = parse(availabilityInput, req.body);
  const product = await withTransaction(async (c) => {
    const { rows } = await c.query(
      `update products set marked_out_of_stock = $2, updated_by = $3 where id = $1 and deleted_at is null returning id`,
      [id, marked_out_of_stock, uid(req)],
    );
    if (!rows[0]) throw notFound('Product not found');
    await audit(c, req, {
      action: marked_out_of_stock ? 'product.mark_out_of_stock' : 'product.mark_available',
      entityType: 'product',
      entityId: id,
      after: { marked_out_of_stock },
    });
    return getAdminProduct(c, id);
  });
  res.json(product);
});

/** Soft delete: keeps order history intact, frees slug/SKU, removes from carts & wishlists. */
productsRouter.delete('/:id', requirePermission('products.manage'), async (req, res) => {
  const id = uuidParam(req.params.id, 'Product');
  await withTransaction(async (c) => {
    const before = await getAdminProduct(c, id, true);
    if (!before) throw notFound('Product not found');
    await c.query('update products set deleted_at = now(), is_active = false, updated_by = $2 where id = $1', [id, uid(req)]);
    await c.query('delete from cart_items where product_id = $1', [id]);
    await c.query('delete from wishlist_items where product_id = $1', [id]);
    await audit(c, req, { action: 'product.delete', entityType: 'product', entityId: id, before });
  });
  res.status(204).end();
});
