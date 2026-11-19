/**
 * Cloudflare Workers entry for the Commerce API.
 * Runs the same Express app through Workers' Node.js HTTP server support (`cloudflare:node`),
 * talks to Supabase Postgres through Hyperdrive, and releases unpaid orders on a cron trigger.
 */
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { releaseExpiredPayments, useHyperdrive } from '@ecommerce/server';
import { app } from './app';

useHyperdrive(() => (env as { HYPERDRIVE: { connectionString: string } }).HYPERDRIVE.connectionString);

const PORT = 8787;
app.listen(PORT);
const http = httpServerHandler({ port: PORT });

export default {
  ...http,
  async scheduled(_controller: unknown, _env: unknown, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(
      releaseExpiredPayments()
        .then((n) => n > 0 && console.log(`[orders] auto-cancelled ${n} unpaid order(s)`))
        .catch((err) => console.error('[orders] expiry job failed', err)),
    );
  },
};
