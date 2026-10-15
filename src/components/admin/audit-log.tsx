'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useLiveFeed, useNow } from '@/hooks/use-live-feed';
import { api } from '@/lib/client';
import { cn } from '@/lib/cn';
import { formatDateTime, relativeTime } from '@/lib/format';
import type { AlertDTO, Severity } from '@/lib/types';
import { CheckCheck, RefreshCw, ScrollText, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type SeverityFilter = '' | Severity;
type StatusFilter = '' | 'READ' | 'UNREAD';

/** Global audit view of every health and stress flag with filtering. */
export function AuditLog() {
  const toast = useToast();
  const { snapshot } = useLiveFeed();
  const now = useNow(5000);

  const [severity, setSeverity] = useState<SeverityFilter>('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [alerts, setAlerts] = useState<AlertDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Debounce the free-text filter so we do not query on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: '200' });
    if (severity) params.set('severity', severity);
    if (status) params.set('status', status);
    if (debouncedSearch) params.set('search', debouncedSearch);

    try {
      const data = await api<AlertDTO[]>(`/api/alerts?${params.toString()}`);
      setAlerts(data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the audit log');
    } finally {
      setLoading(false);
    }
  }, [severity, status, debouncedSearch]);

  // Load on filter changes and whenever the simulation broadcasts new flags.
  useEffect(() => {
    void load();
  }, [load, snapshot?.seq]);

  async function markRead(ids: string[] | null) {
    setBusy(true);
    try {
      await api('/api/alerts', {
        method: 'PATCH',
        body: JSON.stringify(ids ? { ids } : { all: true }),
      });
      toast.success(ids ? 'Alert acknowledged' : 'All alerts acknowledged');
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not update alerts');
    } finally {
      setBusy(false);
    }
  }

  const unreadCount = alerts.filter((alert) => !alert.isRead).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">System audit log</h2>
          <p className="text-xs text-ink-muted">
            Every health and stress flag raised by the monitoring engine, school-wide
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<CheckCheck className="h-3.5 w-3.5" />}
            onClick={() => void markRead(null)}
            disabled={busy || unreadCount === 0}
          >
            Mark all read
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
          <Field label="Severity" className="w-36">
            <Select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as SeverityFilter)}
              className="h-8 text-xs"
            >
              <option value="">All severities</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
            </Select>
          </Field>

          <Field label="Status" className="w-36">
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              className="h-8 text-xs"
            >
              <option value="">All</option>
              <option value="UNREAD">Unread</option>
              <option value="READ">Read</option>
            </Select>
          </Field>

          <Field label="Search" className="min-w-[180px] flex-1">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Student name or message…"
              className="h-8 text-xs"
            />
          </Field>

          <span className="pb-2 text-2xs tabular text-ink-faint">
            {loading ? 'Loading…' : `${alerts.length} result${alerts.length === 1 ? '' : 's'}`}
            {unreadCount > 0 && !loading ? ` · ${unreadCount} unread` : ''}
          </span>
        </div>

        {error ? (
          <div className="flex items-center justify-between gap-3 px-4 py-6">
            <p className="text-sm text-rose-600">{error}</p>
            <Button size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-muted text-left text-2xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Severity</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Section</th>
                  <th className="px-3 py-2 font-medium">Message</th>
                  <th className="px-4 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading
                  ? Array.from({ length: 6 }, (_, index) => (
                      <tr key={index}>
                        <td colSpan={6} className="px-4 py-2.5">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      </tr>
                    ))
                  : alerts.map((alert) => {
                      const critical = alert.severity === 'CRITICAL';
                      return (
                        <tr
                          key={alert.id}
                          className={cn(
                            'transition-colors hover:bg-surface-muted/60',
                            !alert.isRead && 'bg-amber-50/40',
                          )}
                        >
                          <td
                            className="whitespace-nowrap px-4 py-2.5 text-xs tabular text-ink-muted"
                            title={formatDateTime(alert.timestamp)}
                          >
                            {relativeTime(alert.timestamp, now)}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge tone={critical ? 'danger' : 'warning'}>
                              <span className="flex items-center gap-1">
                                {critical ? (
                                  <ShieldAlert className="h-3 w-3" />
                                ) : (
                                  <TriangleAlert className="h-3 w-3" />
                                )}
                                {critical ? 'Critical' : 'Warning'}
                              </span>
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-medium text-ink">
                            {alert.studentName}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge tone="neutral">{alert.gradeClass ?? '—'}</Badge>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-ink-muted">{alert.message}</td>
                          <td className="px-4 py-2.5 text-right">
                            {alert.isRead ? (
                              <span className="text-2xs text-ink-faint">Read</span>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => void markRead([alert.id])}
                              >
                                Mark read
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && alerts.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-5 w-5" />}
            title="No alerts match these filters"
            description="Flags appear here automatically when a student's readings cross the configured thresholds."
          />
        ) : null}
      </Card>
    </div>
  );
}
