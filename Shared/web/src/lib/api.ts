import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, type UploadFolder } from '@ecommerce/shared';
import { supabase } from './supabase';

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export type Query = Record<string, string | number | boolean | null | undefined>;

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const url = new URL(API_URL + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the URU API. Check that it is running and VITE_API_URL is correct.');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', path, body),
  del: <T = void>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

/** Presigned direct upload to Cloudflare R2. Returns the public URL to store on the record. */
export async function uploadImage(file: File, folder: UploadFolder): Promise<{ url: string; storage_key: string }> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) throw new Error('Use a JPG, PNG, WebP or AVIF image');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image must be 5 MB or smaller');
  const presign = await api.post<{ upload_url: string; public_url: string; key: string; headers: Record<string, string> }>(
    '/admin/uploads/presign',
    { folder, file_name: file.name, content_type: file.type, size: file.size },
  );
  const res = await fetch(presign.upload_url, { method: 'PUT', headers: presign.headers, body: file });
  if (!res.ok) throw new Error(`Upload failed (${res.status}). Check the R2 bucket CORS settings.`);
  return { url: presign.public_url, storage_key: presign.key };
}
