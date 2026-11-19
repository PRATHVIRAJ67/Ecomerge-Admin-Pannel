import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPermission, type AdminPermission, type Profile, type Role } from '@ecommerce/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { supabase } from '../lib/supabase';

type Status = 'loading' | 'signed_out' | 'ready' | 'forbidden' | 'error';

interface AuthState {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  message: string | null;
  isSuper: boolean;
  can: (permission: AdminPermission) => boolean;
  canAny: (permissions: readonly AdminPermission[]) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children, allowedRoles = ["admin", "super_admin"] }: { children: ReactNode; allowedRoles?: Role[] }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitialised(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const me = useQuery({
    queryKey: ['me', userId],
    queryFn: () => api.get<Profile>('/me'),
    enabled: Boolean(userId),
    retry: false,
    staleTime: 60_000,
  });

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    qc.clear();
  }, [qc]);

  const value = useMemo<AuthState>(() => {
    const profile = me.data ?? null;
    let status: Status = 'ready';
    let message: string | null = null;
    if (!initialised) status = 'loading';
    else if (!session) status = 'signed_out';
    else if (me.isPending) status = 'loading';
    else if (me.error) {
      const err = me.error;
      status = err instanceof ApiError && (err.status === 403 || err.status === 401) ? 'forbidden' : 'error';
      message = err.message;
    } else if (!profile || !allowedRoles.includes(profile.role)) {
      status = 'forbidden';
      message = 'This account does not have admin access.';
    }
    return {
      status,
      session,
      profile,
      message,
      isSuper: profile?.role === 'super_admin',
      can: (p) => hasPermission(profile, p),
      canAny: (ps) => ps.some((p) => hasPermission(profile, p)),
      signIn,
      signOut,
    };
  }, [initialised, session, me.data, me.isPending, me.error, signIn, signOut, allowedRoles]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
