import { brand, type AdminPermission } from '@ecommerce/shared';
import { ChevronsLeft, ChevronsRight, LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Badge, cx } from './ui';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Shown if the user holds ANY of these permissions. */
  permissions?: readonly AdminPermission[];
}
export interface NavSection {
  title: string;
  items: NavItem[];
}

function readCollapsed() {
  try {
    return localStorage.getItem('staff-sidebar-collapsed') === '1';
  } catch {
    return false;
  }
}

export function AppShell({ sections, appName }: { sections: NavSection[]; appName: string }) {
  const { profile, signOut, isSuper, canAny } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    try {
      localStorage.setItem('staff-sidebar-collapsed', collapsed ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  const visible = sections.map((s) => ({ ...s, items: s.items.filter((i) => !i.permissions || canAny(i.permissions)) })).filter((s) => s.items.length);
  const initials = (profile?.full_name ?? profile?.email ?? '?').split(/\s|@/)[0]!.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen lg:flex">
      {mobileOpen && <div className="fixed inset-0 z-40 bg-forest-900/50 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-forest-800 text-cream transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          collapsed ? 'lg:w-[76px]' : 'lg:w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-cream font-display text-lg font-bold text-forest-800">{brand.name.charAt(0)}</div>
          <div className={cx('min-w-0', collapsed && 'lg:hidden')}>
            <p className="font-display text-lg font-semibold leading-none tracking-wide">{brand.name}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-terracotta-200">{appName}</p>
          </div>
          <button className="ml-auto rounded-lg p-1 text-cream/70 hover:text-cream lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {visible.map((section) => (
            <div key={section.title}>
              <p className={cx('mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-cream/40', collapsed && 'lg:hidden')}>{section.title}</p>
              <ul className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cx(
                          'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
                          isActive ? 'bg-white/10 text-white' : 'text-cream/70 hover:bg-white/5 hover:text-white',
                          collapsed && 'lg:justify-center lg:px-0',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-terracotta-500" />}
                          <item.icon className={cx('size-[18px] shrink-0', isActive ? 'text-terracotta-200' : '')} />
                          <span className={cx('truncate', collapsed && 'lg:hidden')}>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden h-9 w-full items-center gap-3 rounded-xl px-3 text-sm text-cream/60 hover:bg-white/5 hover:text-white lg:flex"
          >
            {collapsed ? <ChevronsRight className="mx-auto size-4" /> : <ChevronsLeft className="size-4" />}
            <span className={cx(collapsed && 'hidden')}>Collapse</span>
          </button>
          <button onClick={() => signOut()} className="flex h-9 w-full items-center gap-3 rounded-xl px-3 text-sm text-cream/60 hover:bg-white/5 hover:text-white">
            <LogOut className={cx('size-4', collapsed && 'lg:mx-auto')} />
            <span className={cx(collapsed && 'lg:hidden')}>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line/70 bg-cream/85 px-4 backdrop-blur lg:px-8">
          <button className="rounded-lg p-2 text-ink-soft hover:bg-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <Badge tone={isSuper ? 'terracotta' : 'forest'}>{isSuper ? 'Super admin' : 'Admin'}</Badge>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-ink">{profile?.full_name ?? 'Staff member'}</p>
              <p className="text-xs text-muted">{profile?.email}</p>
            </div>
            <div className="grid size-9 place-items-center rounded-full bg-forest-700 text-xs font-semibold text-white">{initials}</div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
