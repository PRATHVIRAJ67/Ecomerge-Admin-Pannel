import type { UploadFolder } from '@ecommerce/shared';
import { ImagePlus, Link2, Star, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { errorMessage, uploadImage } from '../lib/api';
import { useToast } from './Toast';
import { Button, Input, Spinner, cx } from './ui';

export interface ImageValue {
  url: string;
  alt?: string | null;
  storage_key?: string | null;
}

/** Upload to R2 (presigned) or paste a URL. First image is the cover. */
export function ImageUploader({ value, onChange, folder, max = 8, disabled }: { value: ImageValue[]; onChange: (v: ImageValue[]) => void; folder: UploadFolder; max?: number; disabled?: boolean }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const full = value.length >= max;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let next = [...value];
    try {
      for (const file of Array.from(files).slice(0, max - value.length)) {
        const uploaded = await uploadImage(file, folder);
        next = [...next, { url: uploaded.url, storage_key: uploaded.storage_key, alt: null }];
        onChange(next);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function addUrl() {
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error();
      onChange([...value, { url: parsed.toString(), alt: null }]);
      setUrl('');
    } catch {
      toast.error('Enter a valid http(s) image URL');
    }
  }

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {value.map((img, i) => (
            <li key={`${img.url}-${i}`} className={cx('group relative aspect-square overflow-hidden rounded-2xl border bg-cream', i === 0 ? 'border-terracotta-500' : 'border-line')}>
              <img src={img.url} alt={img.alt ?? ''} className="size-full object-cover" />
              {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-terracotta-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Cover</span>}
              {!disabled && (
                <div className="absolute inset-x-2 bottom-2 flex justify-end gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                  {i > 0 && (
                    <button type="button" title="Make cover" onClick={() => onChange([img, ...value.filter((_, j) => j !== i)])} className="rounded-lg bg-white/95 p-1.5 text-forest-700 shadow hover:bg-white">
                      <Star className="size-4" />
                    </button>
                  )}
                  <button type="button" title="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded-lg bg-white/95 p-1.5 text-danger shadow hover:bg-white">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && !full && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-cream/50 px-4 py-8 text-sm text-ink-soft transition hover:border-forest-300 hover:bg-forest-50"
          >
            {busy ? <Spinner /> : <ImagePlus className="size-6 text-forest-600" />}
            <span className="font-medium">{busy ? 'Uploading…' : 'Upload images'}</span>
            <span className="text-xs text-muted">JPG, PNG, WebP or AVIF · up to 5 MB · {max - value.length} remaining</span>
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple={max > 1} className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <div className="flex gap-2">
            <Input placeholder="…or paste an image URL" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())} />
            <Button variant="secondary" icon={Link2} onClick={addUrl} disabled={!url.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
