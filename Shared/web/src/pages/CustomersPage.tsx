import type { CustomerDetail, CustomerRow, Paginated } from '@ecommerce/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { OrderStatusBadge } from '../components/StatusBadges';
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingBlock, Modal, PageHeader, Pagination, TD, TH, TR, Table } from '../components/ui';
import { api } from '../lib/api';
import { formatDate, formatDateTime, formatINR } from '../lib/format';
import { useAction, useDebounced } from '../lib/hooks';

function CustomerModal({ id, onClose, allowSuspend }: { id: string; onClose: () => void; allowSuspend: boolean }) {
  const auth = useAuth();
  const q = useQuery({ queryKey: ['customers', id], queryFn: () => api.get<CustomerDetail>(`/admin/customers/${id}`) });
  const status = useAction((s: 'active' | 'suspended') => api.patch(`/super/users/${id}/status`, { status: s }), { success: 'Account status updated', invalidate: [['customers']] });
  const c = q.data;
  return (
    <Modal open onClose={onClose} size="lg" title={c?.full_name ?? c?.email ?? 'Customer'} description={c ? `Customer since ${formatDate(c.created_at)}` : undefined}
      footer={allowSuspend && auth.isSuper && c && (c.status === 'active'
        ? <Button variant="danger" loading={status.isPending} onClick={() => status.mutate('suspended')}>Suspend account</Button>
        : <Button loading={status.isPending} onClick={() => status.mutate('active')}>Reactivate account</Button>)}>
      {q.isLoading || !c ? <LoadingBlock /> : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-cream p-4"><p className="text-xs text-muted">Orders</p><p className="tabular font-display text-2xl font-semibold">{c.order_count}</p></div>
            <div className="rounded-2xl bg-cream p-4"><p className="text-xs text-muted">Total spent</p><p className="tabular font-display text-2xl font-semibold">{formatINR(c.total_spent)}</p></div>
            <div className="rounded-2xl bg-cream p-4"><p className="text-xs text-muted">Contact</p><p className="truncate text-sm font-medium">{c.email}</p><p className="text-sm text-muted">{c.phone ?? '—'}</p></div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Addresses</p>
            {c.addresses.length ? <ul className="grid gap-3 sm:grid-cols-2">{c.addresses.map((a) => (
              <li key={a.id} className="rounded-2xl border border-line p-3 text-sm text-ink-soft">{a.is_default && <Badge tone="forest" className="mb-1">Default</Badge>}<p className="font-medium text-ink">{a.full_name}</p><p>{a.line1}, {a.city}, {a.state} – {a.pincode}</p></li>
            ))}</ul> : <p className="text-sm text-muted">No saved addresses.</p>}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Orders</p>
            {c.orders.length ? <ul className="divide-y divide-line/60 rounded-2xl border border-line">{c.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                {auth.can('orders.manage') ? <Link to={`/orders/${o.id}`} className="font-medium text-forest-700 hover:underline">{o.order_number}</Link> : <span className="font-medium">{o.order_number}</span>}
                <span className="text-muted">{formatDateTime(o.created_at)}</span><OrderStatusBadge status={o.status} /><span className="tabular font-semibold">{formatINR(o.total)}</span>
              </li>
            ))}</ul> : <p className="text-sm text-muted">No orders yet.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function CustomersPage({ allowSuspend = false }: { allowSuspend?: boolean }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const q = useDebounced(search);
  const list = useQuery({ queryKey: ['customers', { q, page }], queryFn: () => api.get<Paginated<CustomerRow>>('/admin/customers', { q, page, limit: 20 }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Customers" description="Everyone who has signed up on the website or mobile app." />
      <Card>
        <div className="border-b border-line/70 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search name, email or phone…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>
        {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorState message={list.error.message} onRetry={() => list.refetch()} /> : !list.data?.items.length ? (
          <EmptyState icon={Users} title="No customers yet" description="Customers appear here after they sign up." />
        ) : (
          <Table>
            <thead><tr><th className={TH}>Customer</th><th className={TH}>Phone</th><th className={`${TH} text-right`}>Orders</th><th className={`${TH} text-right`}>Total spent</th><th className={TH}>Last order</th><th className={TH}>Joined</th><th className={TH}>Status</th></tr></thead>
            <tbody>
              {list.data.items.map((c) => (
                <tr key={c.id} className={`${TR} cursor-pointer`} onClick={() => setOpen(c.id)}>
                  <td className={TD}><p className="font-medium">{c.full_name ?? '—'}</p><p className="text-xs text-muted">{c.email}</p></td>
                  <td className={`${TD} text-ink-soft`}>{c.phone ?? '—'}</td>
                  <td className={`${TD} tabular text-right`}>{c.order_count}</td>
                  <td className={`${TD} tabular text-right font-medium`}>{formatINR(c.total_spent)}</td>
                  <td className={`${TD} text-muted`}>{formatDate(c.last_order_at)}</td>
                  <td className={`${TD} text-muted`}>{formatDate(c.created_at)}</td>
                  <td className={TD}><Badge tone={c.status === 'active' ? 'green' : 'red'}>{c.status === 'active' ? 'Active' : 'Suspended'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {list.data && <Pagination page={page} limit={list.data.limit} total={list.data.total} onPage={setPage} />}
      </Card>
      {open && <CustomerModal id={open} allowSuspend={allowSuspend} onClose={() => setOpen(null)} />}
    </>
  );
}
