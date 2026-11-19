import type { CartSummary, ProductCard } from '@ecommerce/shared';
import { getSettings, pool, productCardColumns, round2, shippingFor } from '@ecommerce/server';

/**
 * Prices a list of cart lines with live catalogue data. Used for the signed-in server cart
 * and for the guest cart preview, so both always show server-side prices, stock and shipping.
 */
export async function buildCartSummary(lines: { product_id: string; quantity: number }[]): Promise<CartSummary> {
  const s = await getSettings();
  const ids = [...new Set(lines.map((l) => l.product_id))];
  const products = new Map<string, ProductCard>();
  if (ids.length) {
    const { rows } = await pool.query<ProductCard>(
      `select ${productCardColumns(s.max_quantity_per_item)}
       from products p left join categories c on c.id = p.category_id
       where p.id = any($1::uuid[]) and p.deleted_at is null`,
      [ids],
    );
    for (const row of rows) products.set(row.id, row);
  }

  const priced = lines
    .filter((l) => products.has(l.product_id))
    .map((l) => {
      const product = products.get(l.product_id)!;
      const available = Boolean(product.in_stock) && l.quantity <= product.max_order_quantity;
      return { product_id: l.product_id, quantity: l.quantity, product, available, line_total: round2(Number(product.price) * l.quantity) };
    });
  const subtotal = round2(priced.filter((l) => l.available).reduce((sum, l) => sum + l.line_total, 0));
  const shipping = shippingFor(subtotal, s);
  return {
    lines: priced,
    item_count: priced.reduce((n, l) => n + l.quantity, 0),
    subtotal,
    shipping_fee: shipping,
    total: round2(subtotal + shipping),
    has_unavailable_items: priced.some((l) => !l.available),
  };
}

export async function loadUserCart(userId: string): Promise<CartSummary> {
  const { rows } = await pool.query<{ product_id: string; quantity: number }>(
    'select product_id, quantity from cart_items where user_id = $1 order by added_at',
    [userId],
  );
  return buildCartSummary(rows);
}
