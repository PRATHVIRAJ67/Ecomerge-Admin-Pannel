import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, features } from '../config/env';
import { HttpError } from './http';

// ---------------------------------------------------------------------------
// Cloudflare R2 (S3-compatible) — presigned direct uploads from the browser
// ---------------------------------------------------------------------------
let r2Client: S3Client | null = null;

function r2(): S3Client {
  if (!features.r2) {
    throw new HttpError(503, 'storage_not_configured', 'Image storage (Cloudflare R2) is not configured on the server. Paste an image URL instead.');
  }
  r2Client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
    // R2 rejects the SDK's default CRC32 checksum params on presigned PUTs.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return r2Client;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export async function presignImageUpload(folder: string, contentType: string) {
  const now = new Date();
  const key = `${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${EXT[contentType] ?? 'bin'}`;
  const uploadUrl = await getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }),
    { expiresIn: 300 },
  );
  return { upload_url: uploadUrl, key, public_url: `${env.R2_PUBLIC_URL!.replace(/\/+$/, '')}/${key}`, headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' } };
}

// ---------------------------------------------------------------------------
// Razorpay
// ---------------------------------------------------------------------------
function assertRazorpay() {
  if (!features.razorpay) throw new HttpError(503, 'payments_not_configured', 'Online payments are not configured. Please choose Cash on Delivery.');
}

export async function createRazorpayOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  assertRazorpay();
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  });
  if (!res.ok) {
    console.error('[razorpay] order create failed', res.status, await res.text().catch(() => ''));
    throw new HttpError(502, 'payment_gateway_error', 'Could not start the payment. Please try again.');
  }
  return (await res.json()) as { id: string; amount: number; currency: string };
}

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifyRazorpayPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  assertRazorpay();
  const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

export function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!features.razorpayWebhook) return false;
  const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET!).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

// ---------------------------------------------------------------------------
// Supabase Auth admin (service role) — creating & banning staff accounts
// ---------------------------------------------------------------------------
let adminClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!features.supabaseAdmin) {
    throw new HttpError(503, 'auth_admin_not_configured', 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.');
  }
  adminClient ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** Blocks/unblocks sign-in at the auth layer (in addition to profile.status). No-op without a service key. */
export async function setAuthBan(userId: string, banned: boolean): Promise<void> {
  if (!features.supabaseAdmin) return;
  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { ban_duration: banned ? '876000h' : 'none' });
  if (error) console.error('[auth] ban update failed', error.message);
}
