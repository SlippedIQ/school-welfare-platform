'use client';

import { FeedStatusPill } from '@/components/live/feed-status';
import { Button } from '@/components/ui/button';
import { useLiveFeed, useNow } from '@/hooks/use-live-feed';
import { cn } from '@/lib/cn';
import { api } from '@/lib/client';
import { SCHOOL_NAME } from '@/lib/constants';
import { formatClock } from '@/lib/format';
import { ROLE_LABELS, type UserRole } from '@/lib/types';
import { Activity, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

export interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  badge?: ReactNode;
}

/** Signed-in identity rendered in the shell chrome. */
export interface ShellUser {
  displayName: string;
  role: UserRole;
}

interface AppShellProps {
  portal: 'teacher' | 'admin' | 'nurse';
  user: ShellUser;
  title: string;
  description?: string;
  nav: NavItem[];
  /** Right-aligned controls rendered inside the top bar (e.g. alert bell). */
  actions?: ReactNode;
  /** Extra controls rendered under the title on mobile widths. */
  children: ReactNode;
}

const portalLabels: Record<AppShellProps['portal'], string> = {
  teacher: 'Teaching',
  admin: 'Master control',
  nurse: 'Nursing',
};

function initialsOf(displayName: string): string {
  return displayName
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Signs out via the API, then hard-navigates to /login (clears all RSC state). */
function SignOutButton({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // Session may already be gone — either way we land on /login.
    }
    window.location.assign('/login');
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={signOut}
      disabled={busy}
      title="Sign out"
      aria-label="Sign out"
      icon={<LogOut className="h-3.5 w-3.5" />}
    >
      {compact ? null : 'Sign out'}
    </Button>
  );
}

/**
 * Shared chrome for all portals: fixed sidebar (with a compact mobile nav),
 * top bar with identity, live-feed status and a clock, and a scrollable
 * content area.
 */
export function AppShell({
  portal,
  user,
  title,
  description,
  nav,
  actions,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const now = useNow(1000);
  const { snapshot } = useLiveFeed();

  return (
    <div className="flex min-h-screen bg-surface-muted">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-white md:flex">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-white">
            <Activity className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-4 text-ink">
              Welfare Console
            </span>
            <span className="block truncate text-2xs leading-4 text-ink-faint">{SCHOOL_NAME}</span>
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 scroll-thin">
          <p className="px-2 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-ink-faint">
            {portalLabels[portal]}
          </p>
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-surface-sunken font-medium text-ink'
                    : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                )}
              >
                <span className={cn('shrink-0', active ? 'text-ink' : 'text-ink-faint')}>
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-2">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-2xs font-semibold text-ink-muted">
              {initialsOf(user.displayName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-ink">
                {user.displayName}
              </span>
              <span className="block truncate text-2xs text-ink-faint">
                {ROLE_LABELS[user.role]}
              </span>
            </span>
          </div>
          <SignOutButton />
          <p className="px-2 pb-1 pt-1 text-2xs text-ink-faint">
            Sensor cadence {snapshot ? 'live' : 'idle'} · demo build
          </p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-ink">{title}</h1>
              {description ? (
                <p className="hidden truncate text-xs text-ink-muted sm:block">{description}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {actions}
              <span className="hidden text-xs tabular text-ink-muted sm:inline">
                {formatClock(now)}
              </span>
              <FeedStatusPill />
              <span className="md:hidden">
                <SignOutButton compact />
              </span>
            </div>
          </div>

          {/* Compact nav for small screens */}
          <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden scroll-thin">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs',
                    active
                      ? 'bg-surface-sunken font-medium text-ink'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="flex-1 px-4 py-4 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}
