import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit, { type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsOrigins, env, features } from './config/env';
import { pool } from './db/pool';
import { errorHandler } from './middleware/error';

interface CreateAppOptions {
  /** Service name reported by /health. */
  name: string;
  /** Routes that need the raw request body (webhooks) — mounted before express.json(). */
  mountRaw?: (app: Express) => void;
  /** Regular JSON routes. */
  mount: (app: Express) => void;
  /** Requests per minute per IP for /api/v1. */
  rateLimitPerMinute?: number;
}

/**
 * Fixed-window in-memory store that needs no timers (express-rate-limit's MemoryStore starts a
 * setInterval at startup, which Cloudflare Workers forbid at module load). Expired windows are
 * reset lazily on the next hit; the map is pruned occasionally to bound memory.
 */
class FixedWindowStore implements Store {
  private windowMs = 60_000;
  private hits = new Map<string, { count: number; resetAt: number }>();
  init(options: Options) {
    this.windowMs = options.windowMs;
  }
  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const e = this.hits.get(key);
    return e && e.resetAt > Date.now() ? { totalHits: e.count, resetTime: new Date(e.resetAt) } : undefined;
  }
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = Date.now();
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    let e = this.hits.get(key);
    if (!e || e.resetAt <= now) {
      e = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, e);
    }
    e.count++;
    return { totalHits: e.count, resetTime: new Date(e.resetAt) };
  }
  async decrement(key: string) {
    const e = this.hits.get(key);
    if (e && e.count > 0) e.count--;
  }
  async resetKey(key: string) {
    this.hits.delete(key);
  }
}

/**
 * Per-IP rate limiter. Behind Cloudflare the real client IP is in `cf-connecting-ip`.
 * (In-memory counters: per process on Node, per isolate on Workers -- a soft limit, not a quota.)
 */
export function limiter(opts: Partial<Options> & { limit: number }) {
  return rateLimit({
    store: new FixedWindowStore(),
    windowMs: 60_000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.get('cf-connecting-ip') ?? req.ip ?? 'unknown',
    validate: { ip: false, trustProxy: false, xForwardedForHeader: false },
    ...opts,
  });
}

/** Common hardened Express setup shared by the Admin and Super Admin backends. */
export function createApp({ name, mountRaw, mount, rateLimitPerMinute = 600 }: CreateAppOptions): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      // Native mobile apps send no Origin header; browsers must be on the allow-list.
      origin: (origin, cb) => cb(null, !origin || corsOrigins.includes(origin)),
      maxAge: 86_400,
    }),
  );
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  mountRaw?.(app);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1', limiter({ limit: rateLimitPerMinute }));

  app.get('/health', async (_req, res) => {
    let database = 'ok';
    try {
      await pool.query('select 1');
    } catch {
      database = 'unreachable';
    }
    res.status(database === 'ok' ? 200 : 503).json({ service: name, status: database === 'ok' ? 'ok' : 'degraded', database, features });
  });

  mount(app);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
  });
  app.use(errorHandler);
  return app;
}

export function startServer(app: Express, name: string, onShutdown?: () => void) {
  const server = app.listen(env.PORT, () => {
    console.log(`${name} ready on http://localhost:${env.PORT}  (r2: ${features.r2}, razorpay: ${features.razorpay}, auth-admin: ${features.supabaseAdmin})`);
  });
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down ${name}…`);
    onShutdown?.();
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  return server;
}
