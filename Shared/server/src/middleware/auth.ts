import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose';
import { ADMIN_PERMISSIONS, hasPermission, type AccountStatus, type AdminPermission, type Role } from '@ecommerce/shared';
import { env } from '../config/env';
import { pool } from '../db/pool';
import { forbidden, HttpError, unauthorized } from '../lib/http';

export interface AuthContext {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: Role;
  status: AccountStatus;
  permissions: AdminPermission[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const issuer = `${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const hsSecret = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : null;
const permissionSet = new Set<string>(ADMIN_PERMISSIONS);

/** Verifies a Supabase access token: asymmetric keys via JWKS, or legacy HS256 shared secret. */
async function verifyAccessToken(token: string): Promise<JWTPayload> {
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw unauthorized('Invalid session token');
  }
  const options = { issuer, audience: 'authenticated' };
  try {
    if (alg?.startsWith('HS')) {
      if (!hsSecret) throw new Error('HS256 token received but SUPABASE_JWT_SECRET is not set');
      return (await jwtVerify(token, hsSecret, options)).payload;
    }
    return (await jwtVerify(token, jwks, options)).payload;
  } catch (err) {
    if (env.NODE_ENV !== 'production') console.warn('[auth] token rejected:', (err as Error).message);
    throw unauthorized('Your session has expired. Please sign in again.');
  }
}

function bearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}

const PROFILE_COLUMNS = 'id, email, full_name, role, status, permissions';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = bearerToken(req);
  if (!token) throw unauthorized();
  const payload = await verifyAccessToken(token);
  const userId = payload.sub;
  if (!userId) throw unauthorized('Invalid session token');

  const email = typeof payload.email === 'string' ? payload.email : null;
  let { rows } = await pool.query(`select ${PROFILE_COLUMNS} from profiles where id = $1`, [userId]);
  if (!rows[0]) {
    // Safety net if the auth trigger was not installed when the user signed up.
    const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
    ({ rows } = await pool.query(
      `insert into profiles (id, email, full_name) values ($1, $2, $3)
       on conflict (id) do update set email = coalesce(profiles.email, excluded.email)
       returning ${PROFILE_COLUMNS}`,
      [userId, email, typeof meta.full_name === 'string' ? meta.full_name : null],
    ));
  }
  const profile = rows[0];
  if (profile.status === 'suspended') {
    throw new HttpError(403, 'account_suspended', 'This account has been suspended. Please contact support.');
  }
  req.auth = {
    userId,
    email: profile.email ?? email,
    fullName: profile.full_name,
    role: profile.role,
    status: profile.status,
    permissions: ((profile.permissions ?? []) as string[]).filter((p): p is AdminPermission => permissionSet.has(p)),
  };
  next();
}

export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthorized();
  if (req.auth.role !== 'admin' && req.auth.role !== 'super_admin') throw forbidden('Admin access only');
  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthorized();
  if (req.auth.role !== 'super_admin') throw forbidden('Super admin access only');
  next();
}

/** Passes if the user holds ANY of the listed permissions (super admin always passes). */
export function requirePermission(...permissions: AdminPermission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!permissions.some((p) => hasPermission(req.auth, p))) {
      throw forbidden(`Missing permission: ${permissions.join(' or ')}`);
    }
    next();
  };
}

export function can(req: Request, permission: AdminPermission): boolean {
  return hasPermission(req.auth, permission);
}
