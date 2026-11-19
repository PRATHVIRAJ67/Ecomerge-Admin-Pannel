import { BANNER_PLACEMENTS, type Banner, type BannerPlacement } from '@ecommerce/shared';
import { useQuery } from '@tanstack/react-query';
import { GalleryHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ImageUploader } from '../components/ImageUploader';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, LoadingBlock, Modal, PageHeader, Select, Switch, SwitchRow } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, fromLocalInput, toLocalInput } from '../lib/format';
import { useAction } from '../lib/hooks';

const PLACEMENT_LABEL: Record<BannerPlacement, string> = { home_hero: 'Home hero', home_strip: 'Home strip', category: 'Category page' };

interface Draft {
  id?: string;
  title: string;
  subtitle: string;
  image_url: string | null;
  mobile_image_url: string | null;
  cta_label: string;
  link_url: string;
  placement: BannerPlacement;
  sort_order: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
}
const blank: Draft = { title: '', subtitle: '', image_url: null, mobile_image_url: null, cta_label: 'Shop now', link_url: '/', placement: 'home_hero', sort_order: '0', is_active: true, starts_at: '', ends_at: '' };

function BannerForm({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const [f, setF] = useState(draft);
  const save = useAction(
    (d: Draft) => {
      const body = { title: d.title.trim(), subtitle: d.subtitle.trim() || null, image_url: d.image_url, mobile_image_url: d.mobile_image_url, cta_label: d.cta_label.trim() || null, link_url: d.link_url.trim() || null, placement: d.placement, sort_order: Number(d.sort_order) || 0, is_active: d.is_active, starts_at: fromLocalInput(d.starts_at), ends_at: fromLocalInput(d.ends_at) };
      return d.id ? api.patch<Banner>(`/admin/banners/${d.id}`, body) : api.post<Banner>('/admin/banners', body);
    },
    { success: 'Banner saved', invalidate: [['banners']], onSuccess: onClose },
  );
  return (
    <Modal open onClose={onClose} size="lg" title={f.id ? 'Edit banner' : 'New banner'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={f.title.trim().length < 2 || !f.image_url} onClick={() => save.mutate(f)}>Save banner</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2"><Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Mango season is here" /></Field>
        <Field label="Subtitle" className="sm:col-span-2"><Input value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} /></Field>
        <Field label="Desktop image (wide)"><ImageUploader folder="banners" max={1} value={f.image_url ? [{ url: f.image_url }] : []} onChange={(v) => setF({ ...f, image_url: v[0]?.url ?? null })} /></Field>
        <Field label="Mobile image (optional)"><ImageUploader folder="banners" max={1} value={f.mobile_image_url ? [{ url: f.mobile_image_url }] : []} onChange={(v) => setF({ ...f, mobile_image_url: v[0]?.url ?? null })} /></Field>
        <Field label="Button label"><Input value={f.cta_label} onChange={(e) => setF({ ...f, cta_label: e.target.value })} /></Field>
        <Field label="Link" hint="e.g. /category/spices-masalas"><Input value={f.link_url} onChange={(e) => setF({ ...f, link_url: e.target.value })} /></Field>
        <Field label="Placement"><Select value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value as BannerPlacement })}>{BANNER_PLACEMENTS.map((p) => <option key={p} value={p}>{PLACEMENT_LABEL[p]}</option>)}</Select></Field>
        <Field label="Sort order"><Input type="number" min={0} value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
        <Field label="Starts"><Input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></Field>
        <Field label="Ends"><Input type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></Field>
        <div className="sm:col-span-2"><SwitchRow title="Active" description="Inactive or out-of-schedule banners are hidden" checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} /></div>
      </div>
    </Modal>
  );
}

export function BannersPage() {
  const q = useQuery({ queryKey: ['banners'], queryFn: () => api.get<Banner[]>('/admin/banners') });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Banner | null>(null);
  const toggle = useAction((b: Banner) => api.patch<Banner>(`/admin/banners/${b.id}`, { is_active: !b.is_active }), { success: 'Banner updated', invalidate: [['banners']] });
  const remove = useAction((id: string) => api.del(`/admin/banners/${id}`), { success: 'Banner deleted', invalidate: [['banners']], onSuccess: () => setDeleting(null) });
  return (
    <>
      <PageHeader title="Banners" description="Hero and promotional banners for the website and app." actions={<Button icon={Plus} onClick={() => setDraft(blank)}>New banner</Button>} />
      {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <Card><EmptyState icon={GalleryHorizontal} title="No banners yet" description="Add a hero banner to make the home page shine." action={<Button icon={Plus} onClick={() => setDraft(blank)}>New banner</Button>} /></Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {q.data.map((b) => (
            <Card key={b.id} className="overflow-hidden">
              <div className="relative aspect-[16/6] bg-cream-dark">
                <img src={b.image_url} alt={b.title} className="size-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-forest-900/70 to-transparent p-5 text-white">
                  <p className="font-display text-xl font-semibold">{b.title}</p>
                  {b.subtitle && <p className="mt-1 max-w-xs text-sm text-white/80">{b.subtitle}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 p-4">
                <Badge tone="forest">{PLACEMENT_LABEL[b.placement]}</Badge>
                {b.ends_at && <Badge tone="amber">Ends {formatDateTime(b.ends_at)}</Badge>}
                <div className="ml-auto flex items-center gap-2">
                  <Switch checked={b.is_active} onChange={() => toggle.mutate(b)} label="Active" />
                  <Button size="icon" variant="ghost" onClick={() => setDraft({ id: b.id, title: b.title, subtitle: b.subtitle ?? '', image_url: b.image_url, mobile_image_url: b.mobile_image_url, cta_label: b.cta_label ?? '', link_url: b.link_url ?? '', placement: b.placement, sort_order: String(b.sort_order), is_active: b.is_active, starts_at: toLocalInput(b.starts_at), ends_at: toLocalInput(b.ends_at) })}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleting(b)}><Trash2 className="size-4 text-danger" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {draft && <BannerForm draft={draft} onClose={() => setDraft(null)} />}
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} loading={remove.isPending} danger title="Delete banner?" confirmLabel="Delete" message={`“${deleting?.title}” will be removed from the storefront.`} />
    </>
  );
}
