import { adminRouter, createApp, requireAuth, requireStaff } from '@ecommerce/server';
import { accountRouter } from './routes/account';
import { catalogRouter } from './routes/catalog';
import { webhooksRouter } from './routes/webhooks';

/** Commerce API (storefront, customer account, admin). Shared by the Node entry and the Cloudflare Worker entry. */
export const app = createApp({
  name: 'admin-backend',
  mountRaw: (a) => a.use('/api/v1/payments', webhooksRouter),
  mount: (a) => {
    a.use('/api/v1/catalog', catalogRouter); // public storefront (website + mobile)
    a.use('/api/v1/me', requireAuth, accountRouter); // customer account, cart, wishlist, checkout, orders
    a.use('/api/v1/admin', requireAuth, requireStaff, adminRouter); // admin dashboard (permission-gated)
  },
});
