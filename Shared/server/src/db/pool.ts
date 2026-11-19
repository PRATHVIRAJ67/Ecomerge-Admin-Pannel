import fs from 'node:fs';
import pg from 'pg';
import { env } from '../config/env';

// numeric → number (prices are numeric(12,2)), bigint → number (counts, identity ids)
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

function sslConfig(): pg.PoolConfig['ssl'] {
  if (env.DATABASE_SSL === 'disable') return false;
  if (env.DATABASE_SSL === 'no-verify') return { rejectUnauthorized: false };
  const ca = env.DATABASE_CA_CERT
    ? env.DATABASE_CA_CERT.includes('BEGIN CERTIFICATE')
      ? env.DATABASE_CA_CERT
      : fs.readFileSync(env.DATABASE_CA_CERT, 'utf8')
    : undefined;
  return { rejectUnauthorized: true, ca };
}

// ---------------------------------------------------------------------------
// Two runtimes, one API:
//  • Node (local dev, any Node host): one long-lived pg.Pool.
//  • Cloudflare Workers: I/O objects can't be shared between requests, so every query /
//    transaction opens its own short-lived client through Hyperdrive, which does the real
//    connection pooling next to the database. Enabled by the Worker entry via useHyperdrive().
// ---------------------------------------------------------------------------
let perCallConnectionString: (() => string) | null = null;
let nodePool: pg.Pool | null = null;

/** Worker entry calls this once with a getter for env.HYPERDRIVE.connectionString. */
export function useHyperdrive(connectionString: () => string) {
  perCallConnectionString = connectionString;
}

function getNodePool(): pg.Pool {
  if (!nodePool) {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    nodePool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      ssl: sslConfig(),
      max: env.DATABASE_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    nodePool.on('error', (err) => console.error('[db] idle client error', err));
  }
  return nodePool;
}

async function openClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: perCallConnectionString!() });
  await client.connect();
  return client;
}

/** Per-call adapter with the pg.Pool surface the code uses (query / connect / end). */
const perCallPool = {
  async query(...args: unknown[]) {
    const client = await openClient();
    try {
      return await (client.query as (...a: unknown[]) => Promise<unknown>)(...args);
    } finally {
      // Await the close: on Workers, un-awaited I/O can be dropped when the response ends, leaking connections.
      await client.end().catch(() => undefined);
    }
  },
  async connect() {
    const client = (await openClient()) as pg.Client & { release: (err?: unknown) => void };
    // release() returns the close promise so withTransaction() can await it (Workers drop un-awaited I/O).
    (client as unknown as { release: () => Promise<unknown> }).release = () => client.end().catch(() => undefined);
    return client;
  },
  async end() {},
};

/** Use exactly like a pg.Pool. Resolves to the right implementation for the current runtime. */
export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    const target = (perCallConnectionString ? perCallPool : getNodePool()) as unknown as Record<PropertyKey, unknown>;
    const value = target[prop];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
  },
});

export type Db = pg.Pool | pg.PoolClient;
export type Tx = pg.PoolClient;

/** Runs fn inside BEGIN/COMMIT; rolls back on any error. */
export async function withTransaction<T>(fn: (client: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    // Node PoolClient.release() returns void; the Workers per-call client returns its close promise.
    await (client.release() as unknown);
  }
}
