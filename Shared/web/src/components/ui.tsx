import { ChevronLeft, ChevronRight, ImageOff, Loader2, X, type LucideIcon } from 'lucide-react';
import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-forest-700 text-white shadow-sm hover:bg-forest-800',
  accent: 'bg-terracotta-500 text-white shadow-sm hover:bg-terracotta-600',
  secondary: 'border border-line bg-white text-ink hover:border-forest-200 hover:bg-forest-50',
  ghost: 'text-ink-soft hover:bg-forest-50 hover:text-forest-700',
  danger: 'bg-danger text-white shadow-sm hover:brightness-95',
};
const SIZES: Record<Size, string> = { sm: 'h-8 gap-1.5 px-3 text-xs', md: 'h-10 gap-2 px-4 text-sm', icon: 'size-9' };

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
}

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, children, className, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500/50 disabled:cursor-not-allowed disabled:opacity-50',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
const CONTROL =
  'w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition placeholder:text-muted/80 focus:border-forest-500 focus:ring-4 focus:ring-forest-500/10 disabled:bg-cream disabled:text-muted';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, 'h-10', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, 'min-h-24 py-2.5 leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(CONTROL, 'h-10 cursor-pointer pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500/50 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-forest-600' : 'bg-line',
      )}
    >
      <span className={cx('inline-block size-5 rounded-full bg-white shadow transition', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

export function SwitchRow({ title, description, checked, onChange, disabled }: { title: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-2xl border border-line/80 bg-white shadow-card', className)}>{children}</section>;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/70 px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-forest-800">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'forest' | 'terracotta';
const TONES: Record<Tone, string> = {
  neutral: 'bg-cream-dark text-ink-soft',
  green: 'bg-success-tint text-success',
  amber: 'bg-warning-tint text-warning',
  red: 'bg-danger-tint text-danger',
  blue: 'bg-info-tint text-info',
  forest: 'bg-forest-100 text-forest-700',
  terracotta: 'bg-terracotta-100 text-terracotta-600',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', TONES[tone], className)}>{children}</span>;
}
export type BadgeTone = Tone;

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-forest-600', className)} />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="max-w-md text-sm text-danger">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-forest-50 text-forest-600">
        <Icon className="size-6" />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Thumb({ src, alt, className }: { src?: string | null; alt?: string; className?: string }) {
  return src ? (
    <img src={src} alt={alt ?? ''} loading="lazy" className={cx('size-11 shrink-0 rounded-xl border border-line/60 object-cover', className)} />
  ) : (
    <div className={cx('grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-forest-50 to-cream-dark text-forest-300', className)}>
      <ImageOff className="size-4" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-raised sm:rounded-3xl',
          size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line/70 px-6 py-5">
          <div>
            <h2 id={titleId} className="font-display text-xl font-semibold text-forest-800">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-cream hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-ink-soft">{message}</div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={cx(
            'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition',
            value === item.value ? 'bg-forest-700 text-white shadow-sm' : 'text-ink-soft hover:bg-white hover:text-forest-700',
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className={cx('tabular rounded-full px-1.5 text-xs', value === item.value ? 'bg-white/20' : 'bg-cream-dark text-muted')}>{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-white p-1">
      {items.map((item) => (
        <button
          key={String(item.value)}
          onClick={() => onChange(item.value)}
          className={cx('h-8 rounded-lg px-3 text-sm font-medium transition', value === item.value ? 'bg-forest-700 text-white' : 'text-ink-soft hover:text-forest-700')}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  if (total <= limit && page === 1) return null;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line/70 px-5 py-3 text-sm text-muted">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="icon" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="secondary" size="icon" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Table shell with premium defaults. */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}
export const TH = 'whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted';
export const TD = 'px-5 py-3.5 align-middle';
export const TR = 'border-t border-line/60 transition hover:bg-cream/70';
