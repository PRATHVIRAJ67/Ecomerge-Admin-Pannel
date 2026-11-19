/** Reusable SQL fragments. Product alias must be `p`, category alias `c`. */

export const IMAGES_JSON = `coalesce((
  select json_agg(json_build_object('id', i.id, 'url', i.url, 'alt', i.alt, 'sort_order', i.sort_order, 'storage_key', i.storage_key)
                  order by i.sort_order, i.created_at)
  from product_images i where i.product_id = p.id), '[]'::json)`;

export const PURCHASABLE = `(p.is_active and not p.marked_out_of_stock and p.stock_quantity > 0 and p.deleted_at is null)`;

export const LOW_STOCK = `(p.stock_quantity > 0 and p.stock_quantity <= p.low_stock_threshold)`;

export const OUT_OF_STOCK = `(p.stock_quantity = 0 or p.marked_out_of_stock)`;

/** Storefront-safe product columns (no exact stock). */
export function productCardColumns(maxQtyPerItem: number): string {
  const max = Math.max(1, Math.floor(Number(maxQtyPerItem) || 10));
  return `p.id, p.name, p.slug, p.sku, p.short_description, p.unit, p.origin, p.tags, p.price, p.mrp, p.is_featured,
    p.category_id, c.name as category_name, c.slug as category_slug,
    ${PURCHASABLE} as in_stock,
    ${LOW_STOCK} as low_stock,
    least(p.stock_quantity, ${max})::int as max_order_quantity,
    ${IMAGES_JSON} as images`;
}

export const ADMIN_PRODUCT_COLUMNS = `p.id, p.category_id, c.name as category_name, c.slug as category_slug,
  p.name, p.slug, p.sku, p.short_description, p.description, p.unit, p.origin, p.tags,
  p.price, p.mrp, p.stock_quantity, p.low_stock_threshold, p.is_active, p.is_featured, p.marked_out_of_stock,
  ${PURCHASABLE} as in_stock, ${LOW_STOCK} as low_stock,
  ${IMAGES_JSON} as images, p.created_at, p.updated_at`;

export const LIVE_BANNER = `is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())`;
