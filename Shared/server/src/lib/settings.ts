import { pool, type Db } from '../db/pool';

export interface StoreSettings {
  store_name: string;
  shipping_fee: number;
  free_shipping_threshold: number;
  cod_enabled: boolean;
  cod_max_order_value: number;
  online_payments_enabled: boolean;
  max_quantity_per_item: number;
  payment_timeout_minutes: number;
  maintenance_mode: boolean;
  [key: string]: unknown;
}

let cache: { at: number; rows: { key: string; value: unknown; is_public: boolean }[] } | null = null;
const TTL_MS = 10_000;

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

async function loadRows(db: Db, fresh: boolean) {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const { rows } = await db.query<{ key: string; value: unknown; is_public: boolean }>(
    'select key, value, is_public from platform_settings',
  );
  cache = { at: Date.now(), rows };
  return rows;
}

export async function getSettings(db: Db = pool, fresh = false): Promise<StoreSettings> {
  const rows = await loadRows(db, fresh);
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
  return {
    ...raw,
    store_name: typeof raw.store_name === 'string' ? raw.store_name : 'URU',
    shipping_fee: num(raw.shipping_fee, 49),
    free_shipping_threshold: num(raw.free_shipping_threshold, 499),
    cod_enabled: bool(raw.cod_enabled, true),
    cod_max_order_value: num(raw.cod_max_order_value, 5000),
    online_payments_enabled: bool(raw.online_payments_enabled, true),
    max_quantity_per_item: Math.max(1, Math.floor(num(raw.max_quantity_per_item, 10))),
    payment_timeout_minutes: Math.max(5, Math.floor(num(raw.payment_timeout_minutes, 30))),
    maintenance_mode: bool(raw.maintenance_mode, false),
  };
}

export async function getPublicSettings(): Promise<Record<string, unknown>> {
  const rows = await loadRows(pool, false);
  return Object.fromEntries(rows.filter((r) => r.is_public).map((r) => [r.key, r.value]));
}

export function invalidateSettings() {
  cache = null;
}

export function shippingFor(subtotal: number, s: StoreSettings): number {
  if (subtotal <= 0 || subtotal >= s.free_shipping_threshold) return 0;
  return s.shipping_fee;
}
