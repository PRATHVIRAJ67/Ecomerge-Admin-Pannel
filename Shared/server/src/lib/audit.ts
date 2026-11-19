import type { Request } from 'express';
import type { Db } from '../db/pool';

interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

const json = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));

/** Writes an audit row. Call inside the same transaction as the change it describes. */
export async function audit(db: Db, req: Request, entry: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, before, after, ip, user_agent)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      req.auth?.userId ?? null,
      req.auth?.email ?? null,
      req.auth?.role ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      json(entry.before),
      json(entry.after),
      req.ip ?? null,
      req.get('user-agent')?.slice(0, 300) ?? null,
    ],
  );
}
