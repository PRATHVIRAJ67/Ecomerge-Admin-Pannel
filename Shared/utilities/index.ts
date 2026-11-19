import type { AdminPermission, Role } from '../constants';

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function hasPermission(
  user: { role: Role; permissions: readonly string[] } | null | undefined,
  permission: AdminPermission,
): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return user.role === 'admin' && user.permissions.includes(permission);
}

export function discountPercent(price: number, mrp: number | null | undefined): number {
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

/** Money helpers — all arithmetic is done in integer paise to avoid floating-point drift. */
export const toPaise = (rupees: number): number => Math.round(rupees * 100);
export const fromPaise = (paise: number): number => paise / 100;
export const multiplyPaise = (unitRupees: number, quantity: number): number => toPaise(unitRupees) * quantity;

/** GST-inclusive price → { base, gst } in paise. */
export function splitGst(inclusivePaise: number, ratePercent: number): { base: number; gst: number } {
  const base = Math.round((inclusivePaise * 100) / (100 + ratePercent));
  return { base, gst: inclusivePaise - base };
}
