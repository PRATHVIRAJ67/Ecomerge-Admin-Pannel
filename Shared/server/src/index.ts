/** Server core shared by Admin/Backend and Super Admin/Backend. Each backend mounts its own routes + guards. */
export { createApp, limiter, startServer } from './app';
export { corsOrigins, env, features } from './config/env';
export { pool, useHyperdrive, withTransaction, type Db, type Tx } from './db/pool';
export * from './lib/http';
export * from './lib/sql';
export { audit } from './lib/audit';
export { getPublicSettings, getSettings, invalidateSettings, shippingFor, type StoreSettings } from './lib/settings';
export {
  createRazorpayOrder,
  presignImageUpload,
  setAuthBan,
  supabaseAdmin,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from './lib/integrations';
export { can, requireAuth, requirePermission, requireStaff, requireSuperAdmin, type AuthContext } from './middleware/auth';
export { errorHandler } from './middleware/error';
export * from './services/orders';
export { adminRouter } from './routes/admin';
export { getAdminProduct } from './routes/admin/products';
