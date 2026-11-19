import { Router } from 'express';
import express from 'express';
import { verifyRazorpayWebhookSignature } from '@ecommerce/server';
import { markRazorpayPaid } from '@ecommerce/server';

/** Mounted BEFORE express.json() — signature is computed over the raw body. */
export const webhooksRouter = Router();

webhooksRouter.post('/razorpay/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const signature = req.get('x-razorpay-signature') ?? '';
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !verifyRazorpayWebhookSignature(raw, signature)) {
    res.status(400).json({ error: { code: 'invalid_signature', message: 'Invalid webhook signature' } });
    return;
  }
  const event = JSON.parse(raw.toString('utf8')) as {
    event: string;
    payload?: { payment?: { entity?: { id: string; order_id: string } } };
  };
  const payment = event.payload?.payment?.entity;
  if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment?.order_id) {
    try {
      await markRazorpayPaid(payment.order_id, payment.id, null);
    } catch (err) {
      // Unknown order ids are acknowledged so Razorpay stops retrying; real errors bubble as 500 → retried.
      if ((err as { status?: number }).status !== 404) throw err;
    }
  }
  res.json({ received: true });
});
