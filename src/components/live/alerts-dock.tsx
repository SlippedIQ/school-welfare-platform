'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLiveFeed, useNow } from '@/hooks/use-live-feed';
import { api } from '@/lib/client';
import { cn } from '@/lib/cn';
import { formatDateTime, relativeTime } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { Bell, BellOff, Check, CheckCheck, ShieldAlert, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';

type Tab = 'ALL' | 'UNREAD';

/**
 * Top-bar alert bell with a slide-over drawer. Marking alerts read goes
 * through the API, which updates SQLite and broadcasts the new state to every
 * connected dashboard.
 */
export function AlertsDock() {
  const { snapshot } = useLiveFeed();
  const toast = useToast();
  const now = useNow(1000);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('ALL');
  const [busy, setBusy] = useState(false);

  const alerts = snapshot?.alerts ?? [];
  const unreadCount = alerts.filter((alert) => !alert.isRead).length;
  const visible = tab === 'UNREAD' ? alerts.filter((alert) => !alert.isRead) : alerts;

  async function markRead(payload: { ids?: string[]; all?: boolean }, successMessage: string) {
    setBusy(true);
    try {
      await api('/api/alerts', { method: 'PATCH', body: JSON.stringify(payload) });
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update alerts');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open notifications (${unreadCount} unread)`}
        className={cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-md border bg-white shadow-panel transition-colors hover:bg-surface-muted',
          unreadCount > 0 ? 'border-amber-200 text-amber-700' : 'border-line text-ink-muted',
        )}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 animate-fade-in bg-ink/25"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-label="Notifications"
            className="absolute inset-y-0 right-0 flex w-full max-w-[380px] animate-slide-in-right flex-col border-l border-line bg-white shadow-overlay"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Notifications</h2>
                <p className="text-xs text-ink-muted">
                  {unreadCount > 0
                    ? `${unreadCount} unread health flag${unreadCount === 1 ? '' : 's'}`
                    : 'All caught up'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="rounded-md p-1 text-ink-faint hover:bg-surface-sunken hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
              <div className="flex gap-1">
                {(['ALL', 'UNREAD'] as Tab[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTab(value)}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                      tab === value
                        ? 'bg-surface-sunken text-ink'
                        : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {value === 'ALL' ? 'All' : 'Unread'}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || unreadCount === 0}
                icon={<CheckCheck className="h-3.5 w-3.5" />}
                onClick={() => void markRead({ all: true }, 'All alerts marked as read')}
              >
                Mark all read
              </Button>
            </div>

            <div className="flex-1 divide-y divide-line overflow-y-auto scroll-thin">
              {visible.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <BellOff className="h-5 w-5 text-ink-faint" />
                  <p className="text-sm font-medium text-ink">No notifications</p>
                  <p className="text-xs text-ink-muted">
                    {tab === 'UNREAD'
                      ? 'Every flag has been acknowledged.'
                      : 'Health thresholds have not been crossed yet.'}
                  </p>
                </div>
              ) : (
                visible.map((alert) => {
                  const critical = alert.severity === 'CRITICAL';
                  return (
                    <article
                      key={alert.id}
                      className={cn(
                        'flex gap-3 px-4 py-3',
                        !alert.isRead ? (critical ? 'bg-rose-50/60' : 'bg-amber-50/50') : 'bg-white',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                          critical
                            ? 'border-rose-200 bg-rose-100 text-rose-600'
                            : 'border-amber-200 bg-amber-100 text-amber-600',
                        )}
                      >
                        {critical ? (
                          <ShieldAlert className="h-3.5 w-3.5" />
                        ) : (
                          <TriangleAlert className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Badge tone={critical ? 'danger' : 'warning'}>
                            {critical ? 'Critical' : 'Warning'}
                          </Badge>
                          {alert.gradeClass ? (
                            <span className="text-2xs text-ink-faint">{alert.gradeClass}</span>
                          ) : null}
                          {!alert.isRead ? (
                            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-ink">{alert.message}</p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span
                            className="text-2xs text-ink-faint"
                            title={formatDateTime(alert.timestamp)}
                          >
                            {relativeTime(alert.timestamp, now)}
                          </span>
                          {!alert.isRead ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void markRead({ ids: [alert.id] }, 'Alert marked as read')
                              }
                              className="inline-flex items-center gap-1 text-2xs font-medium text-accent hover:text-accent-hover disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" />
                              Mark read
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

/** Thin banner that surfaces the most recent unread flag above dashboards. */
export function AlertTicker({ className }: { className?: string }) {
  const { snapshot } = useLiveFeed();
  const now = useNow(5000);

  const unread = (snapshot?.alerts ?? []).filter((alert) => !alert.isRead);
  const [index, setIndex] = useState(0);

  if (unread.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink-muted shadow-panel',
          className,
        )}
      >
        <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
        No active health flags — all readings within threshold.
      </div>
    );
  }

  const alert = unread[index % unread.length];
  const critical = alert.severity === 'CRITICAL';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-panel',
        critical
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-amber-200 bg-amber-50 text-amber-800',
        className,
      )}
      onMouseEnter={() => undefined}
    >
      {critical ? (
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
      )}
      <p className="min-w-0 flex-1 truncate">
        <span className="font-medium">{critical ? 'Critical · ' : 'Warning · '}</span>
        {alert.message}
      </p>
      <span className="shrink-0 tabular opacity-70" title={formatDateTime(alert.timestamp)}>
        {relativeTime(alert.timestamp, now)}
      </span>
      {unread.length > 1 ? (
        <button
          type="button"
          onClick={() => setIndex((current) => current + 1)}
          className="shrink-0 font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
        >
          Next
        </button>
      ) : null}
    </div>
  );
}
