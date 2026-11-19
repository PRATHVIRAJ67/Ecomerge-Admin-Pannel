import { slugify, type Category } from '@ecommerce/shared';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { ImageUploader } from '../components/ImageUploader';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, LoadingBlock, Modal, PageHeader, Select, Switch, SwitchRow, TD, TH, TR, Table, Textarea, Thumb } from '../components/ui';
import { api } from '../lib/api';
import { CATALOG_KEYS, useAction } from '../lib/hooks';

interface Draft {
  id?: string;
  name: string;
  slug: string;
  description: string;
  image_url: string | null;
  parent_id: string;
  sort_order: string;
  is_active: boolean;
}
const blank: Draft = { name: '', slug: '', description: '', image_url: null, parent_id: '', sort_order: '0', is_active: true };

function CategoryForm({ draft, categories, onClose }: { draft: Draft; categories: Category[]; onClose: () => void }) {
  const [form, setForm] = useState(draft);
  const [slugTouched, setSlugTouched] = useState(Boolean(draft.id));
  useEffect(() => setForm(draft), [draft]);
  const save = useAction(
    (f: Draft) => {
      const body = { name: f.name.trim(), slug: f.slug || slugify(f.name), description: f.description.trim() || null, image_url: f.image_url, parent_id: f.parent_id || null, sort_order: Number(f.sort_order) || 0, is_active: f.is_active };
      return f.id ? api.patch<Category>(`/admin/categories/${f.id}`, body) : api.post<Category>('/admin/categories', body);
    },
    { success: (c) => `Category “${c.name}” saved`, invalidate: CATALOG_KEYS, onSuccess: onClose },
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={form.id ? 'Edit category' : 'New category'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={form.name.trim().length < 2} onClick={() => save.mutate(form)}>Save category</Button></>}
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) }))} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="URL slug"><Input value={form.slug} onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: slugify(e.target.value) })); }} /></Field>
          <Field label="Parent category">
            <Select value={form.parent_id} onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}>
              <option value="">None (top level)</option>
              {categories.filter((c) => c.id !== form.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Description"><Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
        <Field label="Image">
          <ImageUploader folder="categories" max={1} value={form.image_url ? [{ url: form.image_url }] : []} onChange={(v) => setForm((f) => ({ ...f, image_url: v[0]?.url ?? null }))} />
        </Field>
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <Field label="Sort order" hint="Lower numbers appear first"><Input type="number" min={0} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} /></Field>
          <SwitchRow title="Visible in store" checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
        </div>
      </div>
    </Modal>
  );
}

export function CategoriesPage() {
  const auth = useAuth();
  const canEdit = auth.can('categories.manage');
  const q = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/admin/categories') });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const toggle = useAction((c: Category) => api.patch<Category>(`/admin/categories/${c.id}`, { is_active: !c.is_active }), { success: (c) => `${c.name} ${c.is_active ? 'is visible' : 'hidden'}`, invalidate: CATALOG_KEYS });
  const remove = useAction((id: string) => api.del(`/admin/categories/${id}`), { success: 'Category deleted', invalidate: CATALOG_KEYS, onSuccess: () => setDeleting(null) });
  const byId = new Map((q.data ?? []).map((c) => [c.id, c]));

  return (
    <>
      <PageHeader title="Categories" description="Organise the catalogue. Changes appear in website and app navigation." actions={canEdit && <Button icon={Plus} onClick={() => setDraft(blank)}>New category</Button>} />
      <Card>
        {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} /> : !q.data?.length ? (
          <EmptyState icon={Tags} title="No categories yet" description="Create categories to group your products." action={canEdit && <Button icon={Plus} onClick={() => setDraft(blank)}>New category</Button>} />
        ) : (
          <Table>
            <thead><tr><th className={TH}>Category</th><th className={TH}>Parent</th><th className={TH}>Products</th><th className={TH}>Order</th><th className={TH}>Visible</th><th className={`${TH} text-right`}>Actions</th></tr></thead>
            <tbody>
              {q.data.map((c) => (
                <tr key={c.id} className={TR}>
                  <td className={TD}><div className="flex items-center gap-3"><Thumb src={c.image_url} /><div><p className="font-medium">{c.name}</p><p className="text-xs text-muted">/{c.slug}</p></div></div></td>
                  <td className={`${TD} text-ink-soft`}>{c.parent_id ? byId.get(c.parent_id)?.name ?? '—' : '—'}</td>
                  <td className={TD}><Badge tone="forest">{c.product_count ?? 0}</Badge></td>
                  <td className={`${TD} tabular`}>{c.sort_order}</td>
                  <td className={TD}><Switch checked={c.is_active} disabled={!canEdit} onChange={() => toggle.mutate(c)} label={`${c.name} visible`} /></td>
                  <td className={`${TD} text-right`}>
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Edit" onClick={() => setDraft({ id: c.id, name: c.name, slug: c.slug, description: c.description ?? '', image_url: c.image_url, parent_id: c.parent_id ?? '', sort_order: String(c.sort_order), is_active: c.is_active })}><Pencil className="size-4" /></Button>
                        <Button size="icon" variant="ghost" title="Delete" onClick={() => setDeleting(c)}><Trash2 className="size-4 text-danger" /></Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {draft && <CategoryForm draft={draft} categories={q.data ?? []} onClose={() => setDraft(null)} />}
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} loading={remove.isPending} danger title="Delete category?" confirmLabel="Delete"
        message={deleting?.product_count ? `“${deleting.name}” still has ${deleting.product_count} product(s). Move them to another category first.` : `“${deleting?.name}” will be permanently deleted.`} />
    </>
  );
}
