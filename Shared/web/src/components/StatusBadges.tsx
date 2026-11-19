import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentMethod, type PaymentStatus } from '@ecommerce/shared';
import { Badge, type BadgeTone } from './ui';

const ORDER_TONE: Record<OrderStatus, BadgeTone> = {
  pending_payment: 'amber',
  confirmed: 'blue',
  packed: 'forest',
  shipped: 'blue',
  out_for_delivery: 'terracotta',
  delivered: 'green',
  cancelled: 'red',
};
const PAYMENT_TONE: Record<PaymentStatus, BadgeTone> = { pending: 'amber', paid: 'green', failed: 'red', refund_pending: 'amber', refunded: 'neutral' };

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <Badge tone={ORDER_TONE[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;

export function PaymentBadge({ method, status }: { method: PaymentMethod; status: PaymentStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone="neutral">{method === 'cod' ? 'COD' : 'Online'}</Badge>
      <Badge tone={PAYMENT_TONE[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>
    </span>
  );
}

export function StockBadge({ product }: { product: { stock_quantity: number; marked_out_of_stock: boolean; low_stock: boolean } }) {
  if (product.marked_out_of_stock) return <Badge tone="red">Marked out of stock</Badge>;
  if (product.stock_quantity <= 0) return <Badge tone="red">Out of stock</Badge>;
  if (product.low_stock) return <Badge tone="amber">Low stock</Badge>;
  return <Badge tone="green">In stock</Badge>;
}
