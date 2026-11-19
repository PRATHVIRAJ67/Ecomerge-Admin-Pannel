import { discountPercent, type AdminProduct, type ManualStockReason, type PriceHistoryEntry } from '@ecommerce/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDateTime, formatINR } from '../lib/format';
import { CATALOG_KEYS, useAction } from '../lib/hooks';
import { Badge, Button, Field, Input, Modal, Segmented, Select, cx } from './ui';

type Mode = 'add' | 'remove' | 'set';
const DEFAULT_REASON: Record<Mode, ManualStockReason> = { add: 'restock', remove: 'adjustment', set: 'correction' };

/** Increase / decrease / set stock. Server enforces no negative stock inside a locked transaction. */
export function StockModal({ product, onClose }: { product: AdminProduct | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<ManualStockReason>('restock');
  const [note, setNote] = useState('');

  useEffect(() => {
    setMode('add');
    setQty('');
    setReason('restock');
    setNote('');
  }, [product?.id]);

  const action = useAction(
    (vars: { id: string; body: object }) => api.post<AdminProduct>(`/admin/products/${vars.id}/stock`, vars.body),
    { success: (p) => `Stock updated — ${p.name} now has ${p.stock_quantity}`, invalidate: CATALOG_KEYS, onSuccess: onClose },
  );

  if (!product) return null;
  const n = Number.parseInt(qty, 10);
  const valid = Number.isFinite(n) && n >= 0 && (mode === 'set' || n > 0);
  const next = !valid ? null : mode === 'add' ? product.stock_quantity + n : mode === 'remove' ? product.stock_quantity - n : n;
  const negative = next !== null && next < 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="Update stock"
      description={`${product.name} · SKU ${product.sku}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || negative}
            loading={action.isPending}
            onClick={() =>
              action.mutate({
                id: product.id,
                body: { mode: mode === 'set' ? 'set' : 'adjust', quantity: mode === 'remove' ? -n : n, reason, note: note.trim() || null },
              })
            }
          >
            Save stock
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setReason(DEFAULT_REASON[m]);
          }}
          items={[
            { value: 'add', label: 'Increase' },
            { value: 'remove', label: 'Decrease' },
            { value: 'set', label: 'Set exact' },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={mode === 'set' ? 'New stock quantity' : 'Quantity'}>
            <Input type="number" min={0} inputMode="numeric" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Reason">
            <Select value={reason} onChange={(e) => setReason(e.target.value as ManualStockReason)}>
              <option value="restock">Restock / new delivery</option>
              <option value="adjustment">Adjustment (damage, loss, sample)</option>
              <option value="correction">Stock count correction</option>
            </Select>
          </Field>
        </div>
        <Field label="Note" hint="Optional — visible in stock history">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Supplier invoice #4521" maxLength={300} />
        </Field>
        <div className="flex items-center justify-between rounded-2xl bg-cream px-4 py-3 text-sm">
          <span className="text-ink-soft">
            Current <b className="tabular text-ink">{product.stock_quantity}</b>
          </span>
          <span className="text-muted">→</span>
          <span className={cx('tabular font-semibold', negative ? 'text-danger' : 'text-ink')}>{next === null ? '—' : next}</span>
        </div>
        {negative && <p className="text-sm text-danger">Stock cannot go below zero.</p>}
      </div>
    </Modal>
  );
}

/** Change selling price & MRP with live discount preview and price history. */
export function PriceModal({ product, onClose }: { product: AdminProduct | null; onClose: () => void }) {
  const [price, setPrice] = useState('');
  const [mrp, setMrp] = useState('');
  useEffect(() => {
    setPrice(product ? String(product.price) : '');
    setMrp(product?.mrp != null ? String(product.mrp) : '');
  }, [product]);

  const history = useQuery({
    queryKey: ['product', product?.id, 'price-history'],
    queryFn: () => api.get<PriceHistoryEntry[]>(`/admin/products/${product!.id}/price-history`),
    enabled: Boolean(product),
  });
  const action = useAction(
    (vars: { id: string; price: number; mrp: number | null }) => api.patch<AdminProduct>(`/admin/products/${vars.id}/price`, { price: vars.price, mrp: vars.mrp }),
    { success: (p) => `Price updated — ${p.name} is now ${formatINR(p.price)}`, invalidate: [...CATALOG_KEYS, ['product', product?.id, 'price-history']], onSuccess: onClose },
  );

  if (!product) return null;
  const p = Number(price);
  const m = mrp.trim() ? Number(mrp) : null;
  const valid = price.trim() !== '' && Number.isFinite(p) && p >= 0 && (m === null || (Number.isFinite(m) && m >= p));

  return (
    <Modal
      open
      onClose={onClose}
      title="Change price"
      description={product.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} loading={action.isPending} onClick={() => action.mutate({ id: product.id, price: p, mrp: m })}>
            Save price
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Selling price (₹)">
            <Input type="number" min={0} step="0.01" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="MRP (₹)" hint="Leave empty for no strike-through" error={m !== null && m < p ? 'MRP must be at least the selling price' : null}>
            <Input type="number" min={0} step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-cream px-4 py-3 text-sm">
          <span className="tabular text-lg font-semibold text-ink">{valid ? formatINR(p) : '—'}</span>
          {valid && m !== null && m > p && (
            <>
              <span className="tabular text-muted line-through">{formatINR(m)}</span>
              <Badge tone="terracotta">{discountPercent(p, m)}% off</Badge>
            </>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Price history</p>
          {history.data?.length ? (
            <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
              {history.data.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 border-b border-line/60 pb-2">
                  <span className="tabular text-ink">
                    {formatINR(h.old_price)} → <b>{formatINR(h.new_price)}</b>
                  </span>
                  <span className="text-xs text-muted">
                    {h.changed_by_email ?? 'system'} · {formatDateTime(h.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{history.isLoading ? 'Loading…' : 'No price changes yet.'}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
