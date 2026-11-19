export const ROLES = ['customer', 'admin', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_STATUSES = ['active', 'suspended'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Permissions a super admin can grant to an admin. Super admins implicitly hold all of them. */
export const ADMIN_PERMISSIONS = [
  'products.manage',
  'prices.manage',
  'inventory.manage',
  'categories.manage',
  'orders.manage',
  'customers.view',
  'banners.manage',
  'analytics.view',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const PERMISSION_INFO: Record<AdminPermission, { label: string; description: string }> = {
  'products.manage': { label: 'Products', description: 'Create, edit, delete products and images' },
  'prices.manage': { label: 'Pricing', description: 'Change selling price and MRP' },
  'inventory.manage': { label: 'Inventory', description: 'Update stock, mark out of stock, inventory reports' },
  'categories.manage': { label: 'Categories', description: 'Create, edit and delete categories' },
  'orders.manage': { label: 'Orders', description: 'View orders, update status, cancel orders' },
  'customers.view': { label: 'Customers', description: 'View customer list and details' },
  'banners.manage': { label: 'Banners', description: 'Manage storefront banners' },
  'analytics.view': { label: 'Analytics', description: 'Sales dashboard and reports' },
};

export const ORDER_STATUSES = [
  'pending_payment',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Allowed status changes made by staff. Cancelling returns stock in the same transaction. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};

/** Statuses a customer may cancel from. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ['pending_payment', 'confirmed'];

/** Orders that count towards revenue. */
export const REVENUE_STATUSES: readonly OrderStatus[] = ['confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

export const PAYMENT_METHODS = ['cod', 'razorpay'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refund_pending', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
};

export const INVENTORY_REASONS = ['initial', 'order', 'order_cancelled', 'restock', 'adjustment', 'correction'] as const;
export type InventoryReason = (typeof INVENTORY_REASONS)[number];

/** Reasons staff can pick when changing stock manually. */
export const MANUAL_STOCK_REASONS = ['restock', 'adjustment', 'correction'] as const;
export type ManualStockReason = (typeof MANUAL_STOCK_REASONS)[number];

export const BANNER_PLACEMENTS = ['home_hero', 'home_strip', 'category'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export const UPLOAD_FOLDERS = ['products', 'categories', 'banners'] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
