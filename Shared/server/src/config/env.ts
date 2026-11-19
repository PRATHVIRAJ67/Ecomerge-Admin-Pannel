import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),

  // Required on Node. On Cloudflare Workers the connection comes from the Hyperdrive binding instead.
  DATABASE_URL: optional,
  DATABASE_SSL: z.enum(['disable', 'no-verify', 'verify']).default('disable'),
  DATABASE_CA_CERT: optional,
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  SUPABASE_URL: z.string().url('SUPABASE_URL must be a URL'),
  SUPABASE_SERVICE_ROLE_KEY: optional,
  SUPABASE_JWT_SECRET: optional,

  R2_ACCOUNT_ID: optional,
  R2_ACCESS_KEY_ID: optional,
  R2_SECRET_ACCESS_KEY: optional,
  R2_BUCKET: optional,
  R2_PUBLIC_URL: optional,

  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Throw (not process.exit) so the error is visible on Node and in Cloudflare Workers logs alike.
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid API environment. Copy .env.example to .env and fill it in.\n${details}`);
}

export const env = parsed.data;

export const features = {
  r2: Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET && env.R2_PUBLIC_URL),
  razorpay: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
  razorpayWebhook: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
  supabaseAdmin: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
};

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
