import { brand } from '@ecommerce/shared';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../lib/api';
import { Button, Field, Input } from '../components/ui';

export function LoginPage({ appName }: { appName: string }) {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.status === 'ready') return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.signIn(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-forest-800 p-12 text-cream lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-forest-600/40 blur-3xl" />
        <div className="absolute -bottom-32 left-10 size-96 rounded-full bg-terracotta-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-cream font-display text-xl font-bold text-forest-800">{brand.name.charAt(0)}</div>
          <span className="font-display text-2xl font-semibold tracking-wide">{brand.name}</span>
        </div>
        <div className="relative max-w-md">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-terracotta-200">{appName} console</p>
          <h1 className="font-display text-5xl font-semibold leading-[1.1] text-cream">{brand.tagline}</h1>
          <p className="mt-6 text-base leading-relaxed text-cream/70">Manage your catalogue, prices, inventory and orders — every change reaches the website and mobile app instantly.</p>
        </div>
        <p className="relative text-xs text-cream/40">© {new Date().getFullYear()} {brand.name}</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <div className="mb-8">
            <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-forest-100 text-forest-700">
              <ShieldCheck className="size-6" />
            </div>
            <h2 className="font-display text-3xl font-semibold text-forest-800">Welcome back</h2>
            <p className="mt-2 text-sm text-ink-soft">Sign in to the {appName.toLowerCase()} console.</p>
          </div>
          {(error || auth.status === 'forbidden') && (
            <div className="mb-5 rounded-xl border border-danger/20 bg-danger-tint px-4 py-3 text-sm text-danger">{error ?? auth.message}</div>
          )}
          <div className="space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-3 text-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
          </div>
          <Button type="submit" className="mt-6 w-full" loading={busy}>
            Sign in
          </Button>
          {auth.status === 'forbidden' && (
            <Button variant="ghost" className="mt-2 w-full" onClick={() => auth.signOut()}>
              Use a different account
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
