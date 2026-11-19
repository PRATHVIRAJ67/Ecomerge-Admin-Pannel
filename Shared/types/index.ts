import type {
  AccountStatus,
  AdminPermission,
  BannerPlacement,
  InventoryReason,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
} from '../constants';

/** All API payloads use snake_case keys — identical to the database columns. */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: Role;
  status: AccountStatus;
  permissions: AdminPermission[];
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  product_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
  sort_order: number;
  storage_key?: string | null;
}

/** Storefront-safe product shape (no exact stock numbers). */
export interface ProductCard {
  id: string;
  name: string;
  slug: string;
  sku: string;
  short_description: string | null;
  unit: string | null;
  origin: string | null;
  tags: string[];
  price: number;
  mrp: number | null;
  is_featured: boolean;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  in_stock: boolean;
  low_stock: boolean;
  max_order_quantity: number;
  images: ProductImage[];
}

export interface ProductDetail extends ProductCard {
  description: string | null;
  related: ProductCard[];
}

/** Full product row as seen by staff. */
export interface AdminProduct {
  id: string;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  name: string;
  slug: string;
  sku: string;
  short_description: string | null;
  description: string | null;
  unit: string | null;
  origin: string | null;
  tags: string[];
  price: number;
  mrp: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
  is_featured: boolean;
  marked_out_of_stock: boolean;
  in_stock: boolean;
  low_stock: boolean;
  images: ProductImage[];
  created_at: string;
  updated_at: string;
}

export interface PriceHistoryEntry {
  id: number;
  old_price: number | null;
  new_price: number;
  old_mrp: number | null;
  new_mrp: number | null;
  changed_by_email: string | null;
  created_at: string;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  mobile_image_url: string | null;
  cta_label: string | null;
  link_url: string | null;
  placement: BannerPlacement;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  label: string | null;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type AddressSnapshot = Pick<
  Address,
  'full_name' | 'phone' | 'line1' | 'line2' | 'landmark' | 'city' | 'state' | 'pincode'
>;

export interface CartLine {
  product_id: string;
  quantity: number;
  product: ProductCard;
  line_total: number;
  available: boolean;
}

export interface CartSummary {
  lines: CartLine[];
  item_count: number;
  subtotal: number;
  shipping_fee: number;
  total: number;
  has_unavailable_items: boolean;
}

export interface OrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  unit: string | null;
  image_url: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface OrderStatusEvent {
  id: number;
  status: OrderStatus;
  note: string | null;
  changed_by_name: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal: number;
  shipping_fee: number;
  discount: number;
  total: number;
  item_count: number;
  shipping_address: AddressSnapshot;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  notes: string | null;
  cancel_reason: string | null;
  placed_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  history?: OrderStatusEvent[];
}

export interface CheckoutResult {
  order: Order;
  razorpay?: { key_id: string; order_id: string; amount: number; currency: string } | null;
}

export interface InventoryMovement {
  id: number;
  product_id: string;
  product_name: string;
  sku: string;
  change: number;
  stock_after: number;
  reason: InventoryReason;
  note: string | null;
  order_id: string | null;
  order_number: string | null;
  actor_email: string | null;
  created_at: string;
}

export interface InventoryReport {
  summary: {
    total_products: number;
    total_units: number;
    stock_value: number;
    low_stock_count: number;
    out_of_stock_count: number;
    marked_out_of_stock_count: number;
  };
  attention: AdminProduct[];
}

export interface CustomerRow {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  status: AccountStatus;
  created_at: string;
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
}

export interface CustomerDetail extends CustomerRow {
  addresses: Address[];
  orders: Order[];
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: Role | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  created_at: string;
}

export interface PlatformSetting {
  key: string;
  value: unknown;
  is_public: boolean;
  label: string | null;
  description: string | null;
  updated_at: string;
}

export interface DashboardStats {
  range_days: number;
  revenue: number;
  revenue_previous: number;
  orders: number;
  orders_previous: number;
  average_order_value: number;
  new_customers: number;
  pending_fulfilment: number;
  low_stock_count: number;
  out_of_stock_count: number;
  sales_by_day: { day: string; revenue: number; orders: number }[];
  status_breakdown: { status: OrderStatus; count: number }[];
  top_products: { product_id: string | null; product_name: string; quantity: number; revenue: number }[];
  recent_orders: Order[];
  low_stock: AdminProduct[];
}

export interface SuperOverview {
  customers: number;
  admins: number;
  suspended_users: number;
  products: number;
  categories: number;
  orders_all_time: number;
  revenue_all_time: number;
  revenue_by_month: { month: string; revenue: number; orders: number }[];
  payment_split: { payment_method: PaymentMethod; orders: number; revenue: number }[];
  category_sales: { category_name: string; revenue: number }[];
}
