import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Please sign in to continue') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this resource') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);
export const conflict = (message: string, details?: unknown) => new HttpError(409, 'conflict', message, details);

/** Validate input with zod; throws a 400 with field-level details. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = details[0];
    const message = first ? (first.path ? `${first.path}: ${first.message}` : first.message) : 'Invalid input';
    throw new HttpError(400, 'validation_error', message, details);
  }
  return result.data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidParam(value: unknown, label = 'Record'): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw notFound(`${label} not found`);
  return value;
}

export function paginated<T extends Record<string, unknown>>(rows: T[], page: number, limit: number) {
  const total = rows.length ? Number(rows[0]!.total_count ?? 0) : 0;
  const items = rows.map(({ total_count: _omit, ...rest }) => rest);
  return { items, total, page, limit };
}

/** Collects positional parameters while building dynamic SQL. */
export class SqlParams {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
