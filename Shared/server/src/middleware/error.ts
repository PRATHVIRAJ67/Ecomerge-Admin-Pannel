import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http';

const CONSTRAINT_MESSAGES: Record<string, string> = {
  products_slug_key: 'Another product already uses this URL slug',
  products_sku_key: 'Another product already uses this SKU',
  products_mrp_gte_price: 'MRP must be at least the selling price',
  products_stock_nonnegative: 'Stock cannot go below zero',
  products_price_nonnegative: 'Price cannot be negative',
  categories_slug_key: 'Another category already uses this URL slug',
  categories_not_own_parent: 'A category cannot be its own parent',
  categories_slug_format: 'Slug may contain only lowercase letters, numbers and hyphens',
  products_slug_format: 'Slug may contain only lowercase letters, numbers and hyphens',
  addresses_pincode_format: 'Enter a valid 6-digit PIN code',
  banners_schedule_check: 'Banner end time must be after its start time',
  cart_items_quantity_range: 'Quantity must be between 1 and 99',
};

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  const e = err as PgError & { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } });
    return;
  }
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'payload_too_large', message: 'Request body is too large' } });
    return;
  }

  const friendly = e?.constraint ? CONSTRAINT_MESSAGES[e.constraint] : undefined;
  switch (e?.code) {
    case '23505':
      res.status(409).json({ error: { code: 'conflict', message: friendly ?? 'This record already exists' } });
      return;
    case '23514':
      res.status(400).json({ error: { code: 'constraint_violation', message: friendly ?? 'A value is outside the allowed range' } });
      return;
    case '23503':
      res.status(409).json({ error: { code: 'reference_error', message: friendly ?? 'A related record is missing or still in use' } });
      return;
    case '22P02':
      res.status(400).json({ error: { code: 'invalid_value', message: 'Invalid identifier or value' } });
      return;
    case '40P01':
    case '40001':
      res.status(409).json({ error: { code: 'retry', message: 'The system was busy. Please try again.' } });
      return;
  }

  console.error('[api] unhandled error', err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } });
}
