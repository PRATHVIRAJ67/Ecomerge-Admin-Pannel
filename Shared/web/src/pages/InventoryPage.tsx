import type { AdminProduct, InventoryMovement, InventoryReport, Paginated } from '@ecommerce/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Boxes, CircleCheck, History } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { StockModal } from '../components/ProductModals';
import { StockBadge } from '../components/StatusBadges';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, Select, TD, TH, TR, Table, Thumb, cx } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, formatINR, formatNumber } from '../lib/format';
import { CATALOG_KEYS, useAction } from '../lib/hooks';

const REASON_LABEL: Record<string, string> = { initial: 'Opening stock', order: 'Order', order_cancelled: 'Order cancelled', restock: 'Restock', adjustment: 'Adjustment', correction: 'Correction' };

export function InventoryPage() {
  const auth = useAuth();
  const canStock = auth.can('inventory.manage');
  const [stockFor, setStockFor] = useState<AdminProduct | null>(null);
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);
  const report = useQuery({ queryKey: ['inventory', 'report'], queryFn: () => api.get<InventoryReport>('/admin/inventory/report') });
  const moves = useQuery({ queryKey: ['inventory', 'movements', reason, page], queryFn: () => api.get<Paginated<InventoryMovement>>('/admin/inventory/movements', { reason, page, limit: 25 }), placeholderData: keepPreviousData });
  const available = useAction((id: string) => api.patch<AdminProduct>(`/admin/products/${id}/availability`, { marked_out_of_stock: false }), { success: (p) => `${p.name} is sellable again`, invalidate: CATALOG_KEYS });
  const s = report.data?.summary;

  return (
    <>
      <PageHeader title="Inventory" description="Stock levels, alerts and a full history of every stock change." />
      {report.isLoading && <LoadingBlock />}
      {report.error && <ErrorState message={report.error.message} onRetry={() => report.refetch()} />}
      {s && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {[
            ['Products', formatNumber(s.total_products)],
            ['Units in stock', formatNumber(s.total_units)],
            ['Stock value', formatINR(Math.round(s.stock_value))],
            ['Low stock', formatNumber(s.low_stock_count)],
            ['Out of stock', formatNumber(s.out_of_stock_count)],
            ['Marked unavailable', formatNumber(s.marked_out_of_stock_count)],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-xs font-medium text-muted">{label}</p>
              <p className="tabular mt-2 font-display text-2xl font-semibold">{value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader title="Needs attention" description="Low-stock and unavailable products" />
        {report.data && !report.data.attention.length ? (
          <EmptyState icon={CircleCheck} title="Everything is in stock" description="No product is below its low-stock threshold." />
        ) : (
          <Table>
            <thead><tr><th className={TH}>Product</th><th className={TH}>Stock</th><th className={TH}>Alert at</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Actions</th></tr></thead>
            <tbody>
              {report.data?.attention.map((p) => (
                <tr key={p.id} className={TR}>
                  <td className={TD}><Link to={`/products/${p.id}`} className="flex items-center gap-3"><Thumb src={p.images[0]?.url} /><div><p className="font-medium hover:text-forest-700">{p.name}</p><p className="text-xs text-muted">{p.sku}</p></div></Link></td>
                  <td className={`${TD} tabular font-semibold`}>{p.stock_quantity}</td>
                  <td className={`${TD} tabular text-muted`}>{p.low_stock_threshold}</td>
                  <td className={TD}><StockBadge product={p} /></td>
                  <td className={`${TD} text-right`}>
                    {canStock && (
                      <div className="flex justify-end gap-2">
                        {p.marked_out_of_stock && <Button size="sm" variant="secondary" loading={available.isPending} onClick={() => available.mutate(p.id)}>Make sellable</Button>}
                        <Button size="sm" icon={Boxes} onClick={() => setStockFor(p)}>Restock</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Stock history"
          description="Every increase and decrease, with who made it"
          actions={
            <Select className="w-48" value={reason} onChange={(e) => { setReason(e.target.value); setPage(1); }}>
              <option value="">All movements</option>
              {Object.entries(REASON_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          }
        />
        {moves.isLoading ? <LoadingBlock /> : !moves.data?.items.length ? (
          <EmptyState icon={History} title="No stock movements yet" />
        ) : (
          <>
            <Table>
              <thead><tr><th className={TH}>When</th><th className={TH}>Product</th><th className={`${TH} text-right`}>Change</th><th className={`${TH} text-right`}>Stock after</th><th className={TH}>Reason</th><th className={TH}>By / note</th></tr></thead>
              <tbody>
                {moves.data.items.map((m) => (
                  <tr key={m.id} className={TR}>
                    <td className={`${TD} whitespace-nowrap text-muted`}>{formatDateTime(m.created_at)}</td>
                    <td className={TD}><p className="font-medium">{m.product_name}</p><p className="text-xs text-muted">{m.sku}</p></td>
                    <td className={cx(TD, 'tabular text-right font-semibold', m.change >= 0 ? 'text-success' : 'text-danger')}>{m.change > 0 ? `+${m.change}` : m.change}</td>
                    <td className={`${TD} tabular text-right`}>{m.stock_after}</td>
                    <td className={TD}><Badge tone={m.reason === 'order' ? 'blue' : m.reason === 'restock' ? 'green' : 'neutral'}>{REASON_LABEL[m.reason] ?? m.reason}</Badge></td>
                    <td className={`${TD} text-xs text-ink-soft`}>
                      <p>{m.actor_email ?? (m.reason === 'order' ? 'Customer' : 'System')}</p>
                      {m.order_number ? <Link to={`/orders/${m.order_id}`} className="text-forest-700 hover:underline">{m.order_number}</Link> : m.note && <p className="text-muted">{m.note}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} limit={moves.data.limit} total={moves.data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <StockModal product={stockFor} onClose={() => setStockFor(null)} />
    </>
  );
}
