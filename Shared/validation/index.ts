import { z } from 'zod';
import {
  ADMIN_PERMISSIONS,
  ALLOWED_IMAGE_TYPES,
  BANNER_PLACEMENTS,
  MANUAL_STOCK_REASONS,
  MAX_IMAGE_BYTES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  UPLOAD_FOLDERS,
} from '../constants';

const slug = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

const money = z.coerce
  .number()
  .min(0, 'Must be 0 or more')
  .max(10_000_000)
  .transform((v) => Math.round(v * 100) / 100);

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const uuid = z.string().uuid();
const httpUrl = z.string().trim().url().max(2048);

// ---------- Common ----------
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------- Catalogue ----------
export const catalogProductsQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(120).optional(),
  sort: z.enum(['relevance', 'newest', 'price_asc', 'price_desc', 'name', 'popular']).default('relevance'),
  min_price: z.coerce.number().min(0).optional(),
  max_price: z.coerce.number().min(0).optional(),
  in_stock: z.enum(['true', 'false']).optional(),
  featured: z.enum(['true', 'false']).optional(),
});

export const productImageInput = z.object({
  url: httpUrl,
  alt: optionalText(200),
  storage_key: optionalText(512),
});

const productFields = {
  name: z.string().trim().min(2).max(160),
  slug: slug.optional(),
  sku: z.string().trim().min(2).max(64).optional(),
  category_id: uuid.nullable().optional(),
  short_description: optionalText(300),
  description: optionalText(5000),
  unit: optionalText(40),
  origin: optionalText(120),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  price: money,
  mrp: money.nullable().optional(),
  stock_quantity: z.coerce.number().int().min(0).max(1_000_000).optional(),
  low_stock_threshold: z.coerce.number().int().min(0).max(100_000).optional(),
  is_active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  marked_out_of_stock: z.boolean().optional(),
  images: z.array(productImageInput).max(10).optional(),
};

export const productCreateInput = z
  .object(productFields)
  .refine((d) => d.mrp == null || d.mrp >= d.price, { message: 'MRP must be at least the selling price', path: ['mrp'] });

/** Stock is changed only through the dedicated stock endpoint (audited movement), never via a plain update. */
export const productUpdateInput = z
  .object({ ...productFields, stock_quantity: z.never().optional() })
  .partial()
  .refine((d) => d.mrp == null || d.price == null || d.mrp >= d.price, {
    message: 'MRP must be at least the selling price',
    path: ['mrp'],
  });

export const priceUpdateInput = z
  .object({ price: money, mrp: money.nullable().optional() })
  .refine((d) => d.mrp == null || d.mrp >= d.price, { message: 'MRP must be at least the selling price', path: ['mrp'] });

export const stockUpdateInput = z.object({
  mode: z.enum(['set', 'adjust']),
  quantity: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  reason: z.enum(MANUAL_STOCK_REASONS).default('adjustment'),
  note: optionalText(300),
});

export const availabilityInput = z.object({ marked_out_of_stock: z.boolean() });

export const adminProductsQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  category_id: uuid.optional(),
  status: z.enum(['all', 'active', 'draft', 'low_stock', 'out_of_stock', 'featured']).default('all'),
  sort: z.enum(['updated', 'newest', 'name', 'price_asc', 'price_desc', 'stock_asc', 'stock_desc']).default('updated'),
});

export const categoryInput = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional(),
  description: optionalText(500),
  image_url: httpUrl.nullable().optional(),
  parent_id: uuid.nullable().optional(),
  sort_order: z.coerce.number().int().min(0).max(10_000).optional(),
  is_active: z.boolean().optional(),
});
export const categoryUpdateInput = categoryInput.partial();

export const bannerInput = z
  .object({
    title: z.string().trim().min(2).max(120),
    subtitle: optionalText(240),
    image_url: httpUrl,
    mobile_image_url: httpUrl.nullable().optional(),
    cta_label: optionalText(40),
    link_url: z.string().trim().max(500).nullable().optional(),
    placement: z.enum(BANNER_PLACEMENTS).default('home_hero'),
    sort_order: z.coerce.number().int().min(0).max(10_000).optional(),
    is_active: z.boolean().optional(),
    starts_at: z.string().datetime({ offset: true }).nullable().optional(),
    ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  });
export const bannerUpdateInput = bannerInput.partial();

export const presignUploadInput = z.object({
  folder: z.enum(UPLOAD_FOLDERS),
  file_name: z.string().trim().min(1).max(200),
  content_type: z.enum(ALLOWED_IMAGE_TYPES),
  size: z.coerce.number().int().min(1).max(MAX_IMAGE_BYTES, 'Image must be 5 MB or smaller'),
});

// ---------- Orders ----------
export const adminOrdersQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  payment_method: z.enum(PAYMENT_METHODS).optional(),
});

export const orderStatusUpdateInput = z.object({
  status: z.enum(ORDER_STATUSES),
  note: optionalText(500),
});

// ---------- Customer ----------
export const profileUpdateInput = z.object({
  full_name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().regex(/^[0-9+\- ]{8,16}$/, 'Enter a valid phone number').nullable().optional(),
});

export const addressInput = z.object({
  label: optionalText(40),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[0-9+\- ]{8,16}$/, 'Enter a valid phone number'),
  line1: z.string().trim().min(3).max(200),
  line2: optionalText(200),
  landmark: optionalText(120),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code'),
  is_default: z.boolean().optional(),
});
export const addressUpdateInput = addressInput.partial();

export const cartQuantityInput = z.object({ quantity: z.coerce.number().int().min(0).max(99) });
export const cartMergeInput = z.object({
  items: z.array(z.object({ product_id: uuid, quantity: z.coerce.number().int().min(1).max(99) })).max(100),
});

export const checkoutInput = z.object({
  address_id: uuid,
  payment_method: z.enum(PAYMENT_METHODS),
  notes: optionalText(500),
});

export const verifyPaymentInput = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(256),
});

export const cancelOrderInput = z.object({ reason: optionalText(300) });

// ---------- Super admin ----------
export const adminCreateInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  full_name: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(72).optional(),
  permissions: z.array(z.enum(ADMIN_PERMISSIONS)).default([]),
});

export const adminUpdateInput = z.object({
  full_name: z.string().trim().min(2).max(120).optional(),
  permissions: z.array(z.enum(ADMIN_PERMISSIONS)).optional(),
});

export const userStatusInput = z.object({ status: z.enum(['active', 'suspended']) });

export const settingsUpdateInput = z.object({
  values: z.record(z.string().min(1).max(64), z.unknown()),
});

export const auditLogsQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  entity_type: z.string().trim().max(40).optional(),
});

export type ProductCreateInput = z.infer<typeof productCreateInput>;
export type ProductUpdateInput = z.infer<typeof productUpdateInput>;
export type StockUpdateInput = z.infer<typeof stockUpdateInput>;
export type CategoryInput = z.infer<typeof categoryInput>;
export type BannerInput = z.infer<typeof bannerInput>;
export type AddressInput = z.infer<typeof addressInput>;
export type CheckoutInput = z.infer<typeof checkoutInput>;
export type AdminCreateInput = z.infer<typeof adminCreateInput>;
