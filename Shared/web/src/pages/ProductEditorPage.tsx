import { discountPercent, slugify, type AdminProduct, type Category } from '@ecommerce/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Boxes, Save } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ImageUploader, type ImageValue } from '../components/ImageUploader';
import { PriceModal, StockModal } from '../components/ProductModals';
import { StockBadge } from '../components/StatusBadges';
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, LoadingBlock, PageHeader, Select, SwitchRow, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, formatINR } from '../lib/format';
import { CATALOG_KEYS, useAction } from '../lib/hooks';

interface FormState {
  name: string;
  slug: string;
  sku: string;
  category_id: string;
  short_description: string;
  description: string;
  unit: string;
  origin: string;
  tags: string;
  price: string;
  mrp: string;
  stock_quantity: string;
  low_stock_threshold: string;
  is_active: boolean;
  is_featured: boolean;
  marked_out_of_stock: boolean;
  images: ImageValue[];
}

const EMPTY: FormState = {
  name: '', slug: '', sku: '', category_id: '', short_description: '', description: '', unit: '', origin: '', tags: '',
  price: '', mrp: '', stock_quantity: '0', low_stock_threshold: '5', is_active: true, is_featured: false, marked_out_of_stock: false, images: [],
};

function fromProduct(p: AdminProduct): FormState {
  return {
    name: p.name, slug: p.slug, sku: p.sku, category_id: p.category_id ?? '', short_description: p.short_description ?? '', description: p.description ?? '',
    unit: p.unit ?? '', origin: p.origin ?? '', tags: p.tags.join(', '), price: String(p.price), mrp: p.mrp != null ? String(p.mrp) : '',
    stock_quantity: String(p.stock_quantity), low_stock_threshold: String(p.low_stock_threshold), is_active: p.is_active, is_featured: p.is_featured,
    marked_out_of_stock: p.marked_out_of_stock, images: p.images.map((i) => ({ url: i.url, alt: i.alt, storage_key: i.storage_key ?? null })),
  };
}

const nullable = (s: string) => (s.trim() ? s.trim() : null);

function toPayload(f: FormState) {
  return {
    name: f.name.trim(), slug: f.slug.trim() || undefined, sku: f.sku.trim() || undefined, category_id: f.category_id || null,
    short_description: nullable(f.short_description), description: nullable(f.description), unit: nullable(f.unit), origin: nullable(f.origin),
    tags: f.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    price: Number(f.price), mrp: f.mrp.trim() ? Number(f.mrp) : null, stock_quantity: Number.parseInt(f.stock_quantity || '0', 10),
    low_stock_threshold: Number.parseInt(f.low_stock_threshold || '0', 10), is_active: f.is_active, is_featured: f.is_featured,
    marked_out_of_stock: f.marked_out_of_stock, images: f.images.map((i) => ({ url: i.url, alt: i.alt ?? null, storage_key: i.storage_key ?? null })),
  };
}

export function ProductEditorPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const auth = useAuth();
  const canProducts = auth.can('products.manage');
  const canPrices = auth.can('prices.manage');
  const canStock = auth.can('inventory.manage');

  const product = useQuery({ queryKey: ['product', id], queryFn: () => api.get<AdminProduct>(`/admin/products/${id}`), enabled: !isNew });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/admin/categories') });
  const [form, setForm] = useState<FormState>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  useEffect(() => {
    if (product.data) {
      setForm(fromProduct(product.data));
      setSlugTouched(true);
    }
  }, [product.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const create = useAction((body: object) => api.post<AdminProduct>('/admin/products', body), {
    success: (p) => `“${p.name}” created`,
    invalidate: CATALOG_KEYS,
    onSuccess: (p) => navigate(`/products/${p.id}`, { replace: true }),
  });
  const update = useAction((body: object) => api.patch<AdminProduct>(`/admin/products/${id}`, body), { success: 'Product saved', invalidate: CATALOG_KEYS });

  // On edit, only send fields that changed — so an admin without e.g. Pricing permission can still save details.
  const changes = useMemo(() => {
    if (isNew || !product.data) return null;
    const before = toPayload(fromProduct(product.data)) as Record<string, unknown>;
    const after = toPayload(form) as Record<string, unknown>;
    delete after.stock_quantity;
    const diff: Record<string, unknown> = {};
    for (const key of Object.keys(after)) if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) diff[key] = after[key];
    return diff;
  }, [form, isNew, product.data]);

  const price = Number(form.price);
  const mrp = form.mrp.trim() ? Number(form.mrp) : null;
  const priceError = form.price.trim() && (!Number.isFinite(price) || price < 0) ? 'Enter a valid price' : null;
  const mrpError = mrp !== null && Number.isFinite(price) && mrp < price ? 'MRP must be at least the selling price' : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (priceError || mrpError) return;
    if (isNew) create.mutate(toPayload(form));
    else if (changes && Object.keys(changes).length) update.mutate(changes);
  }

  if (!isNew && product.isLoading) return <LoadingBlock />;
  if (!isNew && product.error) return <ErrorState message={product.error.message} onRetry={() => product.refetch()} />;

  const saving = create.isPending || update.isPending;
  const dirty = isNew || Boolean(changes && Object.keys(changes).length);
  const p = product.data;

  return (
    <form onSubmit={onSubmit}>
      <PageHeader
        back={<Link to="/products" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-forest-700"><ArrowLeft className="size-4" /> Products</Link>}
        title={isNew ? 'Add product' : form.name || 'Edit product'}
        description={p ? `Last updated ${formatDateTime(p.updated_at)}` : 'Fill in the details — the product goes live as soon as it is published.'}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/products')}>Cancel</Button>
            <Button type="submit" icon={Save} loading={saving} disabled={!dirty || !canProducts && isNew}>
              {isNew ? 'Create product' : 'Save changes'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Basic information" />
            <div className="space-y-4 p-5">
              <Field label="Product name">
                <Input required minLength={2} maxLength={160} disabled={!canProducts} value={form.name} placeholder="e.g. Byadgi Chilli Powder"
                  onChange={(e) => { set('name', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)); }} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="URL slug" hint="Used in the product link">
                  <Input disabled={!canProducts} value={form.slug} onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value)); }} />
                </Field>
                <Field label="SKU" hint={isNew ? 'Leave empty to auto-generate' : undefined}>
                  <Input disabled={!canProducts} value={form.sku} maxLength={64} onChange={(e) => set('sku', e.target.value.toUpperCase())} placeholder="URU-SP-010" />
                </Field>
              </div>
              <Field label="Short description" hint="Shown on product cards (max 300 characters)">
                <Input disabled={!canProducts} maxLength={300} value={form.short_description} onChange={(e) => set('short_description', e.target.value)} />
              </Field>
              <Field label="Description">
                <Textarea disabled={!canProducts} rows={6} maxLength={5000} value={form.description} onChange={(e) => set('description', e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Images" description="The first image is the cover shown in listings." />
            <div className="p-5">
              <ImageUploader folder="products" value={form.images} onChange={(v) => set('images', v)} disabled={!canProducts} max={10} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Unit / pack size"><Input disabled={!canProducts} value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="500 g, 1 L, Pack of 2" /></Field>
              <Field label="Origin (village / city)"><Input disabled={!canProducts} value={form.origin} onChange={(e) => set('origin', e.target.value)} placeholder="Udupi, Karnataka" /></Field>
              <Field label="Tags" hint="Comma separated — used in search" className="sm:col-span-2">
                <Input disabled={!canProducts} value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="organic, bestseller, gift" />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Visibility" />
            <div className="space-y-4 p-5">
              <SwitchRow title="Published" description="Visible on website and mobile app" checked={form.is_active} onChange={(v) => set('is_active', v)} disabled={!canProducts} />
              <SwitchRow title="Featured" description="Highlighted on the home page" checked={form.is_featured} onChange={(v) => set('is_featured', v)} disabled={!canProducts} />
              <Field label="Category">
                <Select disabled={!canProducts} value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                  <option value="">Uncategorised</option>
                  {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? '' : ' (hidden)'}</option>)}
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Pricing" actions={!isNew && canPrices && <Button size="sm" variant="ghost" onClick={() => setPriceOpen(true)}>History</Button>} />
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Selling price (₹)" error={priceError}>
                  <Input required type="number" min={0} step="0.01" disabled={!canPrices && !isNew} value={form.price} onChange={(e) => set('price', e.target.value)} />
                </Field>
                <Field label="MRP (₹)" error={mrpError}>
                  <Input type="number" min={0} step="0.01" disabled={!canPrices && !isNew} value={form.mrp} onChange={(e) => set('mrp', e.target.value)} />
                </Field>
              </div>
              {Number.isFinite(price) && form.price && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="tabular font-semibold">{formatINR(price)}</span>
                  {mrp !== null && mrp > price && (<><span className="tabular text-muted line-through">{formatINR(mrp)}</span><Badge tone="terracotta">{discountPercent(price, mrp)}% off</Badge></>)}
                </div>
              )}
              <p className="text-xs text-muted">Prices include GST. Per-product GST rates are on the roadmap.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Inventory" />
            <div className="space-y-4 p-5">
              {isNew ? (
                <Field label="Opening stock" hint="Recorded as the first stock movement">
                  <Input type="number" min={0} value={form.stock_quantity} onChange={(e) => set('stock_quantity', e.target.value)} />
                </Field>
              ) : (
                p && (
                  <div className="flex items-center justify-between rounded-2xl bg-cream px-4 py-3">
                    <div>
                      <p className="text-xs text-muted">In stock</p>
                      <p className="tabular font-display text-2xl font-semibold">{p.stock_quantity}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StockBadge product={p} />
                      {canStock && <Button size="sm" variant="secondary" icon={Boxes} onClick={() => setStockOpen(true)}>Update stock</Button>}
                    </div>
                  </div>
                )
              )}
              <Field label="Low-stock alert at">
                <Input type="number" min={0} disabled={!canProducts} value={form.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} />
              </Field>
              <SwitchRow title="Mark out of stock" description="Stops sales even if stock remains" checked={form.marked_out_of_stock} onChange={(v) => set('marked_out_of_stock', v)} disabled={!canStock && !isNew} />
            </div>
          </Card>
        </div>
      </div>
      {p && stockOpen && <StockModal product={p} onClose={() => setStockOpen(false)} />}
      {p && priceOpen && <PriceModal product={p} onClose={() => setPriceOpen(false)} />}
    </form>
  );
}
