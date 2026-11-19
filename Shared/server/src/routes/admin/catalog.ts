import { Router } from 'express';
import {
  bannerInput,
  bannerUpdateInput,
  categoryInput,
  categoryUpdateInput,
  presignUploadInput,
  slugify,
  type AdminPermission,
} from '@ecommerce/shared';
import { pool, withTransaction } from '../../db/pool';
import { audit } from '../../lib/audit';
import { badRequest, conflict, forbidden, notFound, parse, uuidParam } from '../../lib/http';
import { presignImageUpload } from '../../lib/integrations';
import { can, requirePermission } from '../../middleware/auth';

// ===========================================================================
// Categories
// ===========================================================================
export const categoriesRouter = Router();

const CATEGORY_FIELDS = ['name', 'slug', 'description', 'image_url', 'parent_id', 'sort_order', 'is_active'] as const;

categoriesRouter.get('/', requirePermission('categories.manage', 'products.manage', 'inventory.manage', 'prices.manage'), async (_req, res) => {
  const { rows } = await pool.query(
    `select c.*, (select count(*) from products p where p.category_id = c.id and p.deleted_at is null)::int as product_count
     from categories c order by c.sort_order, c.name`,
  );
  res.json(rows);
});

categoriesRouter.post('/', requirePermission('categories.manage'), async (req, res) => {
  const body = parse(categoryInput, req.body);
  const category = await withTransaction(async (c) => {
    if (body.parent_id) {
      const parent = await c.query('select 1 from categories where id = $1', [body.parent_id]);
      if (!parent.rowCount) throw badRequest('Parent category not found');
    }
    const { rows } = await c.query(
      `insert into categories (name, slug, description, image_url, parent_id, sort_order, is_active)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [body.name, body.slug ?? slugify(body.name), body.description ?? null, body.image_url ?? null, body.parent_id ?? null, body.sort_order ?? 0, body.is_active ?? true],
    );
    await audit(c, req, { action: 'category.create', entityType: 'category', entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
  res.status(201).json(category);
});

categoriesRouter.patch('/:id', requirePermission('categories.manage'), async (req, res) => {
  const id = uuidParam(req.params.id, 'Category');
  const body = parse(categoryUpdateInput, req.body);
  const category = await withTransaction(async (c) => {
    const before = (await c.query('select * from categories where id = $1 for update', [id])).rows[0];
    if (!before) throw notFound('Category not found');
    if (body.parent_id) {
      // Reject cycles: the new parent may not be this category or any of its descendants.
      const cycle = await c.query(
        `with recursive chain as (
           select id, parent_id from categories where id = $1
           union all
           select c.id, c.parent_id from categories c join chain on c.id = chain.parent_id
         ) select 1 from chain where id = $2`,
        [body.parent_id, id],
      );
      if (cycle.rowCount) throw badRequest('A category cannot be placed inside itself or one of its sub-categories');
    }
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const field of CATEGORY_FIELDS) {
      if (body[field] === undefined) continue;
      params.push(body[field]);
      sets.push(`${field} = $${params.length}`);
    }
    if (!sets.length) throw badRequest('Nothing to update');
    const { rows } = await c.query(`update categories set ${sets.join(', ')} where id = $1 returning *`, params);
    await audit(c, req, { action: 'category.update', entityType: 'category', entityId: id, before, after: rows[0] });
    return rows[0];
  });
  res.json(category);
});

categoriesRouter.delete('/:id', requirePermission('categories.manage'), async (req, res) => {
  const id = uuidParam(req.params.id, 'Category');
  await withTransaction(async (c) => {
    const before = (await c.query('select * from categories where id = $1 for update', [id])).rows[0];
    if (!before) throw notFound('Category not found');
    const live = (await c.query<{ n: number }>('select count(*)::int as n from products where category_id = $1 and deleted_at is null', [id])).rows[0]!.n;
    if (live > 0) throw conflict(`Move or delete the ${live} product(s) in "${before.name}" first`);
    await c.query('update products set category_id = null where category_id = $1', [id]); // soft-deleted leftovers
    await c.query('delete from categories where id = $1', [id]);
    await audit(c, req, { action: 'category.delete', entityType: 'category', entityId: id, before });
  });
  res.status(204).end();
});

// ===========================================================================
// Banners
// ===========================================================================
export const bannersRouter = Router();
bannersRouter.use(requirePermission('banners.manage'));

const BANNER_FIELDS = ['title', 'subtitle', 'image_url', 'mobile_image_url', 'cta_label', 'link_url', 'placement', 'sort_order', 'is_active', 'starts_at', 'ends_at'] as const;

bannersRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query('select * from banners order by placement, sort_order, created_at desc');
  res.json(rows);
});

bannersRouter.post('/', async (req, res) => {
  const body = parse(bannerInput, req.body);
  const banner = await withTransaction(async (c) => {
    const { rows } = await c.query(
      `insert into banners (title, subtitle, image_url, mobile_image_url, cta_label, link_url, placement, sort_order, is_active, starts_at, ends_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
      [body.title, body.subtitle ?? null, body.image_url, body.mobile_image_url ?? null, body.cta_label ?? null, body.link_url ?? null, body.placement, body.sort_order ?? 0, body.is_active ?? true, body.starts_at ?? null, body.ends_at ?? null],
    );
    await audit(c, req, { action: 'banner.create', entityType: 'banner', entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
  res.status(201).json(banner);
});

bannersRouter.patch('/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Banner');
  const body = parse(bannerUpdateInput, req.body);
  const banner = await withTransaction(async (c) => {
    const before = (await c.query('select * from banners where id = $1 for update', [id])).rows[0];
    if (!before) throw notFound('Banner not found');
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const field of BANNER_FIELDS) {
      if (body[field] === undefined) continue;
      params.push(body[field]);
      sets.push(`${field} = $${params.length}`);
    }
    if (!sets.length) throw badRequest('Nothing to update');
    const { rows } = await c.query(`update banners set ${sets.join(', ')} where id = $1 returning *`, params);
    await audit(c, req, { action: 'banner.update', entityType: 'banner', entityId: id, before, after: rows[0] });
    return rows[0];
  });
  res.json(banner);
});

bannersRouter.delete('/:id', async (req, res) => {
  const id = uuidParam(req.params.id, 'Banner');
  await withTransaction(async (c) => {
    const { rows } = await c.query('delete from banners where id = $1 returning *', [id]);
    if (!rows[0]) throw notFound('Banner not found');
    await audit(c, req, { action: 'banner.delete', entityType: 'banner', entityId: id, before: rows[0] });
  });
  res.status(204).end();
});

// ===========================================================================
// Uploads — presigned PUT to Cloudflare R2
// ===========================================================================
export const uploadsRouter = Router();

const FOLDER_PERMISSION: Record<string, AdminPermission> = {
  products: 'products.manage',
  categories: 'categories.manage',
  banners: 'banners.manage',
};

uploadsRouter.post('/presign', async (req, res) => {
  const body = parse(presignUploadInput, req.body);
  if (!can(req, FOLDER_PERMISSION[body.folder]!)) throw forbidden('You cannot upload images to this section');
  res.json(await presignImageUpload(body.folder, body.content_type));
});
