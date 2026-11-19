import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}
interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<Tone, { icon: typeof Info; className: string }> = {
  success: { icon: CircleCheck, className: 'text-success' },
  error: { icon: TriangleAlert, className: 'text-danger' },
  info: { icon: Info, className: 'text-info' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((s) => s.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: Tone, message: string) => {
      const id = Date.now() + Math.random();
      setItems((s) => [...s.slice(-3), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const { icon: Icon, className } = TONE[t.tone];
          return (
            <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-raised">
              <Icon className={`mt-0.5 size-5 shrink-0 ${className}`} />
              <p className="flex-1 text-sm text-ink">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
