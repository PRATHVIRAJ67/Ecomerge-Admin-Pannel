import type { DashboardStats } from '@ecommerce/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Boxes, Clock, IndianRupee, Package, ShoppingBag, TriangleAlert, Users, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { BarChart, HBarList } from '../components/Charts';
import { OrderStatusBadge, StockBadge } from '../components/StatusBadges';
import { Card, CardHeader, ErrorState, LoadingBlock, PageHeader, Segmented, TD, TH, TR, Table, Thumb, cx } from '../components/ui';
import { api } from '../lib/api';
import { deltaPercent, formatCompactINR, formatDateTime, formatINR, formatNumber } from '../lib/format';
import { ORDER_STATUS_LABELS } from '@ecommerce/shared';

function StatTile({ label, value, icon: Icon, delta, hint, to }: { label: string; value: string; icon: LucideIcon; delta?: number | null; hint?: string; to?: string }) {
  const body = (
    <Card className="h-full p-5 transition hover:shadow-raised">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-ink-soft">{label}</p>
        <div className="grid size-9 place-items-center rounded-xl bg-forest-50 text-forest-600">
          <Icon className="size-[18px]" />
        </div>
      </div>
      <p className="tabular mt-3 font-display text-3xl font-semibold text-ink">{value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta !== undefined && delta !== null && (
          <span className={cx('inline-flex items-center gap-0.5 font-semibold', delta >= 0 ? 'text-success' : 'text-danger')}>
            {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-muted">{hint}</span>}
      </div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function DashboardPage() {
  const auth = useAuth();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const allowed = auth.can('analytics.view');
  const q = useQuery({ queryKey: ['dashboard', days], queryFn: () => api.get<DashboardStats>('/admin/analytics/dashboard', { days }), enabled: allowed, refetchInterval: 60_000 });
  const firstName = auth.profile?.full_name?.split(' ')[0] ?? 'there';

  if (!allowed) {
    return (
      <>
        <PageHeader title={`Namaste, ${firstName}`} description="Your account has limited access. Use the menu to open the sections you manage." />
      </>
    );
  }

  const d = q.data;
  return (
    <>
      <PageHeader
        title={`Namaste, ${firstName}`}
        description="Here is how your store is performing."
        actions={<Segmented value={days} onChange={setDays} items={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />}
      />
      {q.isLoading && <LoadingBlock />}
      {q.error && <ErrorState message={q.error.message} onRetry={() => q.refetch()} />}
      {d && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Revenue" value={formatINR(d.revenue)} icon={IndianRupee} delta={deltaPercent(d.revenue, d.revenue_previous)} hint={`vs previous ${days} days`} />
            <StatTile label="Orders" value={formatNumber(d.orders)} icon={ShoppingBag} delta={deltaPercent(d.orders, d.orders_previous)} hint={`vs previous ${days} days`} to="/orders" />
            <StatTile label="Average order value" value={formatINR(d.average_order_value)} icon={Package} hint={`${formatNumber(d.new_customers)} new customers`} />
            <StatTile label="To fulfil" value={formatNumber(d.pending_fulfilment)} icon={Clock} hint="confirmed + packed orders" to="/orders?status=confirmed" />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Revenue by day"
                description="Confirmed and fulfilled orders, India time"
                actions={<Segmented value={view} onChange={setView} items={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} />}
              />
              <div className="p-5">
                {view === 'chart' ? (
                  <BarChart
                    ariaLabel={`Revenue per day for the last ${days} days`}
                    format={formatCompactINR}
                    data={d.sales_by_day.map((s) => {
                      const date = new Date(`${s.day}T00:00:00`);
                      return {
                        key: s.day,
                        label: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                        tooltipTitle: date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
                        value: s.revenue,
                        detail: `${s.orders} order${s.orders === 1 ? '' : 's'}`,
                      };
                    })}
                  />
                ) : (
                  <div className="max-h-[260px] overflow-y-auto">
                    <Table>
                      <thead>
                        <tr>
                          <th className={TH}>Day</th>
                          <th className={`${TH} text-right`}>Orders</th>
                          <th className={`${TH} text-right`}>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...d.sales_by_day].reverse().map((s) => (
                          <tr key={s.day} className={TR}>
                            <td className={TD}>{s.day}</td>
                            <td className={`${TD} tabular text-right`}>{s.orders}</td>
                            <td className={`${TD} tabular text-right`}>{formatINR(s.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Top products" description={`By revenue, last ${days} days`} />
              <div className="p-5">
                <HBarList format={formatINR} items={d.top_products.map((t) => ({ label: t.product_name, value: t.revenue, sub: `${t.quantity} sold` }))} />
              </div>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Recent orders" actions={<Link to="/orders" className="text-sm font-medium text-forest-700 hover:underline">View all</Link>} />
              {d.recent_orders.length ? (
                <Table>
                  <tbody>
                    {d.recent_orders.map((o) => (
                      <tr key={o.id} className={TR}>
                        <td className={TD}>
                          <Link to={`/orders/${o.id}`} className="font-medium text-forest-700 hover:underline">
                            {o.order_number}
                          </Link>
                          <p className="text-xs text-muted">{formatDateTime(o.created_at)}</p>
                        </td>
                        <td className={TD}>{o.customer_name ?? '—'}</td>
                        <td className={TD}>
                          <OrderStatusBadge status={o.status} />
                        </td>
                        <td className={`${TD} tabular text-right font-medium`}>{formatINR(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <p className="px-5 py-10 text-center text-sm text-muted">No orders yet. They will appear here as soon as customers check out.</p>
              )}
            </Card>
            <div className="space-y-6">
              <Card>
                <CardHeader
                  title="Stock alerts"
                  description={`${d.low_stock_count} low · ${d.out_of_stock_count} out of stock`}
                  actions={<Link to="/inventory" className="text-sm font-medium text-forest-700 hover:underline">Inventory</Link>}
                />
                <ul className="divide-y divide-line/60">
                  {d.low_stock.length ? (
                    d.low_stock.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                        <Thumb src={p.images[0]?.url} className="size-9" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="tabular text-xs text-muted">{p.stock_quantity} left</p>
                        </div>
                        <StockBadge product={p} />
                      </li>
                    ))
                  ) : (
                    <li className="flex items-center gap-2 px-5 py-6 text-sm text-muted">
                      <Boxes className="size-4" /> All products are well stocked.
                    </li>
                  )}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Orders by status" description={`Last ${days} days`} />
                <div className="p-5">
                  <HBarList format={formatNumber} items={d.status_breakdown.map((s) => ({ label: ORDER_STATUS_LABELS[s.status], value: s.count }))} />
                </div>
              </Card>
            </div>
          </div>
          {d.out_of_stock_count > 0 && (
            <p className="flex items-center gap-2 text-sm text-warning">
              <TriangleAlert className="size-4" /> {d.out_of_stock_count} active product(s) cannot be purchased because they are out of stock.
            </p>
          )}
          <p className="flex items-center gap-2 text-xs text-muted">
            <Users className="size-3.5" /> Updates every minute.
          </p>
        </div>
      )}
    </>
  );
}
