import type { AdminPermission, Role } from '@ecommerce/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { StrictMode, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { AppShell, type NavSection } from './components/AppShell';
import { ToastProvider } from './components/Toast';
import { Button, EmptyState, ErrorState, Spinner } from './components/ui';
import { supabaseConfigured } from './lib/supabase';
import { LoginPage } from './pages/LoginPage';

export interface StaffRoute {
  path?: string;
  index?: boolean;
  element: ReactNode;
  /** User needs ANY of these permissions. */
  permissions?: AdminPermission[];
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
});

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-cream p-6">{children}</div>;
}

function Guard({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <FullScreen><Spinner className="size-8" /></FullScreen>;
  if (auth.status === 'signed_out' || auth.status === 'forbidden') return <Navigate to="/login" replace />;
  if (auth.status === 'error') return <FullScreen><ErrorState message={auth.message ?? 'Could not load your account'} onRetry={() => window.location.reload()} /></FullScreen>;
  return <>{children}</>;
}

function RequirePermission({ permissions, children }: { permissions?: AdminPermission[]; children: ReactNode }) {
  const auth = useAuth();
  if (permissions && !auth.canAny(permissions)) {
    return <EmptyState icon={Lock} title="No access" description="Your account does not have permission for this section. Ask a super admin to grant it." action={<Link to="/"><Button variant="secondary">Back to dashboard</Button></Link>} />;
  }
  return <>{children}</>;
}

function SetupScreen() {
  return (
    <FullScreen>
      <div className="max-w-lg rounded-3xl border border-line bg-white p-8 shadow-card">
        <h1 className="font-display text-2xl font-semibold text-forest-800">Configuration needed</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Create a <code className="rounded bg-cream px-1">.env</code> file next to this app's <code className="rounded bg-cream px-1">package.json</code> (copy <code className="rounded bg-cream px-1">.env.example</code>) with
          <code className="rounded bg-cream px-1"> VITE_SUPABASE_URL</code>, <code className="rounded bg-cream px-1">VITE_SUPABASE_ANON_KEY</code> and <code className="rounded bg-cream px-1">VITE_API_URL</code>, then restart the dev server.
        </p>
      </div>
    </FullScreen>
  );
}

export function StaffApp({ appName, allowedRoles, sections, routes }: { appName: string; allowedRoles: Role[]; sections: NavSection[]; routes: StaffRoute[] }) {
  if (!supabaseConfigured) return <SetupScreen />;
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider allowedRoles={allowedRoles}>
              <Routes>
                <Route path="/login" element={<LoginPage appName={appName} />} />
                <Route element={<Guard><AppShell sections={sections} appName={appName} /></Guard>}>
                  {routes.map((r) => {
                    const element = <RequirePermission permissions={r.permissions}>{r.element}</RequirePermission>;
                    return r.index ? <Route key="__index" index element={element} /> : <Route key={r.path} path={r.path} element={element} />;
                  })}
                  <Route path="*" element={<EmptyState icon={Lock} title="Page not found" action={<Link to="/"><Button variant="secondary">Go home</Button></Link>} />} />
                </Route>
              </Routes>
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>
  );
}
