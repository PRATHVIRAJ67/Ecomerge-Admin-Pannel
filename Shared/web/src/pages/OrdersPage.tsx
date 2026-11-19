import { ORDER_STATUS_LABELS, ORDER_STATUSES, ORDER_TRANSITIONS, type Order, type OrderStatus, type Paginated } from '@ecommerce/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, MapPin, Search, ShoppingBag, User } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { OrderStatusBadge, PaymentBadge } from '../components/StatusBadges';
import { Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, TD, TH, TR, Table, Tabs, Textarea, Thumb } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, formatINR } from '../lib/format';
import { useAction, useDebounced } from '../lib/hooks';

type StatusTab = OrderStatus | 'all';

export function OrdersPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<StatusTab>((params.get('status') as OrderStatus | null) ?? 'all');
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const list = useQuery({
    queryKey: ['orders', { status, q, method, page }],
    queryFn: () => api.get<Paginated<Order> & { counts: Partial<Record<OrderStatus, number>> }>('/admin/orders', { status: status === 'all' ? undefined : status, q, payment_method: method, page, limit: 20 }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <>
      <PageHeader title="Orders" description="Track, fulfil and cancel orders. Cancelling returns stock automatically." />
      <Tabs value={status} onChange={(s) => { setStatus(s); setPage(1); }} items={[{ value: 'all', label: 'All', count: total }, ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s], count: counts[s] ?? 0 }))]} />
      <Card className="mt-4">
        <div className="flex flex-wrap gap-3 border-b border-line/70 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Order number, customer name, email or phone…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select className="w-44" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}>
            <option value="">All payments</option>
            <option value="cod">Cash on Delivery</option>
            <option value="razorpay">Online (Razorpay)</option>
          </Select>
        </div>
        {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorState message={list.error.message} onRetry={() => list.refetch()} /> : !list.data?.items.length ? (
          <EmptyState icon={ShoppingBag} title="No orders found" description="Orders placed on the website or app will appear here." />
        ) : (
          <Table>
            <thead><tr><th className={TH}>Order</th><th className={TH}>Customer</th><th className={TH}>Items</th><th className={TH}>Payment</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Total</th></tr></thead>
            <tbody>
              {list.data.items.map((o) => (
                <tr key={o.id} className={`${TR} cursor-pointer`} onClick={() => navigate(`/orders/${o.id}`)}>
                  <td className={TD}><p className="font-medium text-forest-700">{o.order_number}</p><p className="text-xs text-muted">{formatDateTime(o.created_at)}</p></td>
                  <td className={TD}><p className="font-medium">{o.customer_name ?? '—'}</p><p className="text-xs text-muted">{o.customer_phone ?? o.customer_email}</p></td>
                  <td className={`${TD} tabular`}>{o.item_count}</td>
                  <td className={TD}><PaymentBadge method={o.payment_method} status={o.payment_status} /></td>
                  <td className={TD}><OrderStatusBadge status={o.status} /></td>
                  <td className={`${TD} tabular text-right font-semibold`}>{formatINR(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {list.data && <Pagination page={page} limit={list.data.limit} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = { packed: 'Mark packed', shipped: 'Mark shipped', out_for_delivery: 'Out for delivery', delivered: 'Mark delivered' };

export function OrderDetailPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['orders', id], queryFn: () => api.get<Order>(`/admin/orders/${id}`) });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const move = useAction((v: { status: OrderStatus; note?: string }) => api.patch<Order>(`/admin/orders/${id}/status`, v), {
    success: (o) => `Order ${o.order_number} is now ${ORDER_STATUS_LABELS[o.status].toLowerCase()}`,
    invalidate: [['orders'], ['dashboard'], ['inventory'], ['products']],
    onSuccess: () => setCancelOpen(false),
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorState message={q.error?.message ?? 'Order not found'} onRetry={() => q.refetch()} />;
  const o = q.data;
  const next = ORDER_TRANSITIONS[o.status];
  const a = o.shipping_address;

  return (
    <>
      <PageHeader
        back={<Link to="/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-forest-700"><ArrowLeft className="size-4" /> Orders</Link>}
        title={o.order_number}
        description={<span className="inline-flex flex-wrap items-center gap-2">Placed {formatDateTime(o.placed_at)} <OrderStatusBadge status={o.status} /></span>}
        actions={
          <>
            {next.filter((s) => s !== 'cancelled').map((s) => (
              <Button key={s} loading={move.isPending && move.variables?.status === s} onClick={() => move.mutate({ status: s })}>{ACTION_LABEL[s] ?? ORDER_STATUS_LABELS[s]}</Button>
            ))}
            {next.includes('cancelled') && <Button variant="secondary" onClick={() => setCancelOpen(true)}>Cancel order</Button>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Items" description={`${o.item_count} unit(s)`} />
            <Table>
              <tbody>
                {o.items?.map((i) => (
                  <tr key={i.id} className={TR}>
                    <td className={TD}><div className="flex items-center gap-3"><Thumb src={i.image_url} /><div><p className="font-medium">{i.product_name}</p><p className="text-xs text-muted">{i.sku}{i.unit ? ` · ${i.unit}` : ''}</p></div></div></td>
                    <td className={`${TD} tabular text-right text-muted`}>{formatINR(i.unit_price)} × {i.quantity}</td>
                    <td className={`${TD} tabular text-right font-semibold`}>{formatINR(i.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <dl className="space-y-2 border-t border-line/70 px-5 py-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular">{formatINR(o.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd className="tabular">{o.shipping_fee ? formatINR(o.shipping_fee) : 'Free'}</dd></div>
              {o.discount > 0 && <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd className="tabular">−{formatINR(o.discount)}</dd></div>}
              <div className="flex justify-between border-t border-line/70 pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular">{formatINR(o.total)}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Tracking timeline" />
            <ol className="relative space-y-5 px-5 py-5">
              {o.history?.map((h, i) => (
                <li key={h.id} className="flex gap-4">
                  <span className={`mt-1 size-3 shrink-0 rounded-full ${i === (o.history?.length ?? 0) - 1 ? 'bg-terracotta-500 ring-4 ring-terracotta-100' : 'bg-forest-500'}`} />
                  <div>
                    <p className="text-sm font-medium">{ORDER_STATUS_LABELS[h.status]}</p>
                    <p className="text-xs text-muted">{formatDateTime(h.created_at)}{h.changed_by_name ? ` · ${h.changed_by_name}` : ''}</p>
                    {h.note && <p className="mt-1 text-sm text-ink-soft">{h.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><User className="size-4 text-forest-600" /> Customer</p>
            <p className="font-medium">{o.customer_name ?? '—'}</p>
            <p className="text-sm text-muted">{o.customer_email}</p>
            <p className="text-sm text-muted">{o.customer_phone}</p>
          </Card>
          <Card className="p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4 text-forest-600" /> Delivery address</p>
            <address className="text-sm not-italic leading-relaxed text-ink-soft">
              <span className="font-medium text-ink">{a.full_name}</span> · {a.phone}<br />
              {a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />
              {a.landmark && <>{a.landmark}<br /></>}
              {a.city}, {a.state} – {a.pincode}
            </address>
          </Card>
          <Card className="p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><CreditCard className="size-4 text-forest-600" /> Payment</p>
            <PaymentBadge method={o.payment_method} status={o.payment_status} />
            {o.razorpay_payment_id && <p className="mt-2 break-all text-xs text-muted">Payment ID {o.razorpay_payment_id}</p>}
            {o.paid_at && <p className="mt-1 text-xs text-muted">Paid {formatDateTime(o.paid_at)}</p>}
            {o.cancel_reason && <p className="mt-3 rounded-xl bg-danger-tint px-3 py-2 text-xs text-danger">Cancelled: {o.cancel_reason}</p>}
          </Card>
          {o.notes && <Card className="p-5"><p className="mb-1 text-sm font-semibold">Customer note</p><p className="text-sm text-ink-soft">{o.notes}</p></Card>}
        </div>
      </div>
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel order?" size="sm" description="Stock for every item is returned automatically."
        footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep order</Button><Button variant="danger" loading={move.isPending} onClick={() => move.mutate({ status: 'cancelled', note: reason.trim() || undefined })}>Cancel order</Button></>}>
        <Field label="Reason (shared with the customer)"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Item damaged in storage" /></Field>
        {o.payment_status === 'paid' && <p className="mt-3 text-sm text-warning">This order was paid online — it will be flagged for refund.</p>}
      </Modal>
    </>
  );
}
