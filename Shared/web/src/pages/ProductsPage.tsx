import { discountPercent, type AdminProduct, type Category, type Paginated } from '@ecommerce/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, IndianRupee, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { PriceModal, StockModal } from '../components/ProductModals';
import { StockBadge } from '../components/StatusBadges';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, LoadingBlock, PageHeader, Pagination, Select, Switch, TD, TH, TR, Table, Tabs, Thumb } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { formatINR } from '../lib/format';
import { CATALOG_KEYS, useAction, useDebounced } from '../lib/hooks';

type Status = 'all' | 'active' | 'draft' | 'low_stock' | 'out_of_stock' | 'featured';
type Counts = Record<Status, number>;

export function ProductsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('all');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState('updated');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stockFor, setStockFor] = useState<AdminProduct | null>(null);
  const [priceFor, setPriceFor] = useState<AdminProduct | null>(null);
  const [deleteFor, setDeleteFor] = useState<AdminProduct | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const q = useDebounced(search);

  const canProducts = auth.can('products.manage');
  const canPrices = auth.can('prices.manage');
  const canStock = auth.can('inventory.manage');

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/admin/categories') });
  const list = useQuery({
    queryKey: ['products', { status, q, categoryId, sort, page }],
    queryFn: () => api.get<Paginated<AdminProduct> & { counts: Counts }>('/admin/products', { status, q, category_id: categoryId, sort, page, limit: 20 }),
    placeholderData: keepPreviousData,
  });

  const availability = useAction(
    (v: { id: string; value: boolean }) => api.patch<AdminProduct>(`/admin/products/${v.id}/availability`, { marked_out_of_stock: v.value }),
    { success: (p) => (p.marked_out_of_stock ? `${p.name} marked out of stock` : `${p.name} is available again`), invalidate: CATALOG_KEYS },
  );
  const remove = useAction((id: string) => api.del(`/admin/products/${id}`), { success: 'Product archived', invalidate: CATALOG_KEYS, onSuccess: () => setDeleteFor(null) });

  const items = list.data?.items ?? [];
  const counts = list.data?.counts;
  const allChecked = items.length > 0 && items.every((p) => selected.has(p.id));

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulk(label: string, run: (id: string) => Promise<unknown>) {
    setBulkBusy(true);
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map(run));
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    for (const key of CATALOG_KEYS) qc.invalidateQueries({ queryKey: key });
    setBulkBusy(false);
    setSelected(new Set());
    if (failed.length) toast.error(`${label}: ${failed.length} of ${ids.length} failed — ${errorMessage(failed[0]!.reason)}`);
    else toast.success(`${label}: ${ids.length} product(s) updated`);
  }

  return (
    <>
      <PageHeader
        title="Products"
        description="Every change here updates the website and mobile app immediately."
        actions={canProducts && <Button icon={Plus} onClick={() => navigate('/products/new')}>Add product</Button>}
      />

      <Tabs
        value={status}
        onChange={(s) => {
          setStatus(s);
          setPage(1);
          setSelected(new Set());
        }}
        items={[
          { value: 'all', label: 'All', count: counts?.all },
          { value: 'active', label: 'Published', count: counts?.active },
          { value: 'draft', label: 'Unpublished', count: counts?.draft },
          { value: 'low_stock', label: 'Low stock', count: counts?.low_stock },
          { value: 'out_of_stock', label: 'Out of stock', count: counts?.out_of_stock },
          { value: 'featured', label: 'Featured', count: counts?.featured },
        ]}
      />

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-3 border-b border-line/70 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search name, SKU or origin…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select className="w-48" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select className="w-44" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="updated">Recently updated</option>
            <option value="newest">Newest</option>
            <option value="name">Name A–Z</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="stock_asc">Stock: low to high</option>
            <option value="stock_desc">Stock: high to low</option>
          </Select>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line/70 bg-forest-50 px-4 py-3 text-sm">
            <span className="mr-2 font-medium text-forest-700">{selected.size} selected</span>
            {canProducts && (
              <>
                <Button size="sm" variant="secondary" loading={bulkBusy} onClick={() => bulk('Publish', (id) => api.patch(`/admin/products/${id}`, { is_active: true }))}>Publish</Button>
                <Button size="sm" variant="secondary" loading={bulkBusy} onClick={() => bulk('Unpublish', (id) => api.patch(`/admin/products/${id}`, { is_active: false }))}>Unpublish</Button>
              </>
            )}
            {canStock && (
              <>
                <Button size="sm" variant="secondary" loading={bulkBusy} onClick={() => bulk('Mark out of stock', (id) => api.patch(`/admin/products/${id}/availability`, { marked_out_of_stock: true }))}>Mark out of stock</Button>
                <Button size="sm" variant="secondary" loading={bulkBusy} onClick={() => bulk('Mark available', (id) => api.patch(`/admin/products/${id}/availability`, { marked_out_of_stock: false }))}>Mark available</Button>
              </>
            )}
            {canProducts && (
              <Button size="sm" variant="danger" loading={bulkBusy} onClick={() => bulk('Archive', (id) => api.del(`/admin/products/${id}`))}>Archive</Button>
            )}
            <button className="ml-auto text-xs text-muted hover:text-ink" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        {list.isLoading ? (
          <LoadingBlock />
        ) : list.error ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : !items.length ? (
          <EmptyState icon={Package} title="No products found" description={q || status !== 'all' ? 'Try a different search or filter.' : 'Add your first product to start selling.'} action={canProducts && !q && <Button icon={Plus} onClick={() => navigate('/products/new')}>Add product</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={`${TH} w-10`}>
                  <input type="checkbox" className="size-4 accent-forest-700" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((p) => p.id)))} aria-label="Select all" />
                </th>
                <th className={TH}>Product</th>
                <th className={TH}>Category</th>
                <th className={TH}>Price</th>
                <th className={TH}>Stock</th>
                <th className={TH}>Sellable</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const off = discountPercent(p.price, p.mrp);
                return (
                  <tr key={p.id} className={TR}>
                    <td className={TD}>
                      <input type="checkbox" className="size-4 accent-forest-700" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} />
                    </td>
                    <td className={TD}>
                      <Link to={`/products/${p.id}`} className="flex items-center gap-3">
                        <Thumb src={p.images[0]?.url} alt={p.name} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink hover:text-forest-700">{p.name}</p>
                          <p className="text-xs text-muted">
                            {p.sku}
                            {p.unit ? ` · ${p.unit}` : ''}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className={`${TD} text-ink-soft`}>{p.category_name ?? '—'}</td>
                    <td className={TD}>
                      <button disabled={!canPrices} onClick={() => setPriceFor(p)} className="group text-left disabled:cursor-default" title={canPrices ? 'Change price' : undefined}>
                        <span className="tabular font-semibold text-ink group-enabled:group-hover:text-forest-700">{formatINR(p.price)}</span>
                        {off > 0 && (
                          <span className="ml-2 inline-flex items-center gap-1.5">
                            <span className="tabular text-xs text-muted line-through">{formatINR(p.mrp)}</span>
                            <Badge tone="terracotta">{off}%</Badge>
                          </span>
                        )}
                      </button>
                    </td>
                    <td className={TD}>
                      <button disabled={!canStock} onClick={() => setStockFor(p)} className="flex items-center gap-2 disabled:cursor-default" title={canStock ? 'Update stock' : undefined}>
                        <span className="tabular w-10 font-semibold text-ink">{p.stock_quantity}</span>
                        <StockBadge product={p} />
                      </button>
                    </td>
                    <td className={TD}>
                      <Switch
                        checked={!p.marked_out_of_stock}
                        disabled={!canStock || availability.isPending}
                        onChange={(v) => availability.mutate({ id: p.id, value: !v })}
                        label={`${p.name} sellable`}
                      />
                    </td>
                    <td className={TD}>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={p.is_active ? 'forest' : 'neutral'}>{p.is_active ? 'Published' : 'Unpublished'}</Badge>
                        {p.is_featured && <Badge tone="terracotta">Featured</Badge>}
                      </div>
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex justify-end gap-1">
                        {canPrices && <Button size="icon" variant="ghost" title="Change price" onClick={() => setPriceFor(p)}><IndianRupee className="size-4" /></Button>}
                        {canStock && <Button size="icon" variant="ghost" title="Update stock" onClick={() => setStockFor(p)}><Boxes className="size-4" /></Button>}
                        <Button size="icon" variant="ghost" title="Edit" onClick={() => navigate(`/products/${p.id}`)}><Pencil className="size-4" /></Button>
                        {canProducts && <Button size="icon" variant="ghost" title="Archive" onClick={() => setDeleteFor(p)}><Trash2 className="size-4 text-danger" /></Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {list.data && <Pagination page={page} limit={list.data.limit} total={list.data.total} onPage={setPage} />}
      </Card>

      <StockModal product={stockFor} onClose={() => setStockFor(null)} />
      <PriceModal product={priceFor} onClose={() => setPriceFor(null)} />
      <ConfirmDialog
        open={Boolean(deleteFor)}
        onClose={() => setDeleteFor(null)}
        onConfirm={() => deleteFor && remove.mutate(deleteFor.id)}
        loading={remove.isPending}
        danger
        title="Archive product?"
        confirmLabel="Archive"
        message={<>“{deleteFor?.name}” will be removed from the store, carts and wishlists. Past orders keep their history.</>}
      />
    </>
  );
}
