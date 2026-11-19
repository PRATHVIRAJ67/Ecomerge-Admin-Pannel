import { releaseExpiredPayments, startServer } from '@ecommerce/server';
import { app } from './app';

// Node entry (local dev / any Node host). On Cloudflare the Worker entry (src/worker.ts) runs this job on a cron trigger.
// Release stock held by unpaid online orders after the payment timeout.
const timer = setInterval(() => {
  releaseExpiredPayments()
    .then((n) => n > 0 && console.log(`[orders] auto-cancelled ${n} unpaid order(s)`))
    .catch((err) => console.error('[orders] expiry job failed', err));
}, 60_000);

startServer(app, 'Admin backend', () => clearInterval(timer));
