'use client';

import { StudentModal } from '@/components/teacher/student-modal';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { StatCard } from '@/components/ui/stat-card';
import { useToast } from '@/components/ui/toast';
import { useLiveFeed } from '@/hooks/use-live-feed';
import { api } from '@/lib/client';
import { formatTemp, relativeTime } from '@/lib/format';
import {
  readingBand,
  STATE_LABELS,
  STRESS_LABELS,
  type AlertDTO,
  type BioState,
  type HealthBand,
  type LiveStudentDTO,
  type StressLevel,
  type StudentDTO,
} from '@/lib/types';
import { BellRing, Radio, ShieldAlert, Signal, Users } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

interface NurseStationProps {
  students: StudentDTO[];
  /** Display name of the signed-in nurse — stamps every note they write. */
  authorName: string;
}

type QueueFilter = 'ALL' | 'ATTENTION' | 'SIGNAL';

/** Lower sorts first in the triage queue. */
const BAND_RANK: Record<HealthBand, number> = { CRITICAL: 0, ELEVATED: 1, NORMAL: 2 };
const STATE_RANK: Record<BioState, number> = { ANXIOUS: 0, SLEEPY: 1, ACTIVE: 2, FOCUSED: 3 };

const STATE_TONES: Record<BioState, BadgeTone> = {
  ANXIOUS: 'warning',
  SLEEPY: 'info',
  ACTIVE: 'neutral',
  FOCUSED: 'success',
};

const STRESS_TONES: Record<StressLevel, BadgeTone> = {
  HIGH: 'danger',
  MODERATE: 'warning',
  LOW: 'success',
};

/**
 * Nurse portal body: school-wide vitals at a glance, a priority-sorted
 * triage queue backed by the live feed, and an acknowledge-as-you-go
 * alert list. Wellbeing notes reuse the shared observation stream.
 */
export function NurseStation({ students, authorName }: NurseStationProps) {
  const toast = useToast();
  const { snapshot } = useLiveFeed();

  const [filter, setFilter] = useState<QueueFilter>('ALL');
  const [selected, setSelected] = useState<StudentDTO | null>(null);
  const [ackBusy, setAckBusy] = useState(false);

  const liveByStudent = useMemo(() => {
    const map = new Map<string, LiveStudentDTO>();
    for (const entry of snapshot?.students ?? []) map.set(entry.studentId, entry);
    return map;
  }, [snapshot]);

  const unreadAlerts = useMemo(
    () => (snapshot?.alerts ?? []).filter((alert) => !alert.isRead),
    [snapshot],
  );
  const unreadStudentIds = useMemo(
    () => new Set(unreadAlerts.map((alert) => alert.studentId)),
    [unreadAlerts],
  );

  const rows = useMemo(() => {
    const computed = students.map((student) => {
      const live = liveByStudent.get(student.id) ?? null;
      const offline = !live || live.sensorStatus === 'OFFLINE';
      const band =
        live && !offline
          ? readingBand(live.heartRate, student.baselineHeartRate, live.bodyTemp)
          : ('NORMAL' as HealthBand);
      const needsAttention =
        band !== 'NORMAL' ||
        (live ? live.state === 'ANXIOUS' || live.state === 'SLEEPY' : false) ||
        offline ||
        unreadStudentIds.has(student.id);

      return { student, live, offline, band, needsAttention };
    });

    computed.sort((a, b) => {
      const bandDelta = BAND_RANK[a.band] - BAND_RANK[b.band];
      if (bandDelta !== 0) return bandDelta;
      const stateDelta =
        STATE_RANK[a.live?.state ?? 'FOCUSED'] - STATE_RANK[b.live?.state ?? 'FOCUSED'];
      if (stateDelta !== 0) return stateDelta;
      return a.student.fullName.localeCompare(b.student.fullName);
    });

    return computed;
  }, [students, liveByStudent, unreadStudentIds]);

  const visibleRows = rows.filter((row) => {
    if (filter === 'ATTENTION') return row.needsAttention;
    if (filter === 'SIGNAL') return row.offline;
    return true;
  });

  const metrics = snapshot?.metrics;
  const offlineSensors = metrics ? Math.max(0, metrics.activeStudents - metrics.onlineSensors) : null;
  const flagged = rows.filter((row) => row.needsAttention).length;

  async function acknowledge(alertIds: string[]) {
    setAckBusy(true);
    try {
      await api('/api/alerts', {
        method: 'PATCH',
        body: JSON.stringify({ ids: alertIds }),
      });
      toast.success(alertIds.length > 1 ? `${alertIds.length} alerts acknowledged` : 'Alert acknowledged');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not acknowledge alert');
    } finally {
      setAckBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Overview tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Students monitored"
          value={metrics?.activeStudents ?? students.length}
          note="wearable bands provisioned"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Needs attention"
          value={flagged}
          note="flags, states or signal issues"
          tone={flagged > 0 ? 'warning' : 'success'}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <StatCard
          label="Unread alerts"
          value={unreadAlerts.length}
          note={unreadAlerts.length > 0 ? 'waiting for acknowledgement' : 'all caught up'}
          tone={unreadAlerts.length > 0 ? 'danger' : 'success'}
          icon={<BellRing className="h-4 w-4" />}
        />
        <StatCard
          label="Sensors offline"
          value={offlineSensors ?? '—'}
          note="bands not reporting"
          tone={offlineSensors ? (offlineSensors > 0 ? 'warning' : 'success') : 'default'}
          icon={<Radio className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Triage queue */}
        <section className="rounded-lg border border-line bg-white shadow-panel lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">Triage queue</h2>
              <p className="text-2xs text-ink-faint">
                Sorted by health band, then behavioural state — critical first
              </p>
            </div>
            <div className="flex gap-1">
              {(
                [
                  ['ALL', 'All'],
                  ['ATTENTION', 'Needs attention'],
                  ['SIGNAL', 'Signal issues'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-md border px-2 py-1 text-2xs font-medium transition-colors ${
                    filter === value
                      ? 'border-line-strong bg-surface-sunken text-ink'
                      : 'border-line bg-white text-ink-muted hover:bg-surface-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-2 font-medium">Student</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Section</th>
                  <th className="px-3 py-2 text-right font-medium">BPM</th>
                  <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Temp</th>
                  <th className="px-3 py-2 font-medium">Stress</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Signal</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        icon={<ShieldAlert className="h-5 w-5" />}
                        title="Nothing in this view"
                        description="No students match the selected filter right now."
                      />
                    </td>
                  </tr>
                ) : (
                  visibleRows.map(({ student, live, offline, band }) => (
                    <tr key={student.id} className="transition-colors hover:bg-surface-muted/60">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-ink">{student.fullName}</p>
                        <p className="text-2xs text-ink-faint">{student.admissionNo}</p>
                      </td>
                      <td className="hidden px-3 py-2.5 text-ink-muted sm:table-cell">
                        {student.gradeClass}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={`tabular font-medium ${
                            band === 'CRITICAL'
                              ? 'text-rose-600'
                              : band === 'ELEVATED'
                                ? 'text-amber-600'
                                : 'text-ink'
                          }`}
                        >
                          {offline || !live ? '—' : live.heartRate}
                        </span>
                      </td>
                      <td className="hidden px-3 py-2.5 text-right tabular text-ink-muted md:table-cell">
                        {offline || !live ? '—' : formatTemp(live.bodyTemp)}
                      </td>
                      <td className="px-3 py-2.5">
                        {offline || !live ? (
                          <Badge tone="muted">—</Badge>
                        ) : (
                          <Badge tone={STRESS_TONES[live.stressLevel]}>
                            {STRESS_LABELS[live.stressLevel]}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {live ? (
                          <Badge tone={STATE_TONES[live.state]}>{STATE_LABELS[live.state]}</Badge>
                        ) : (
                          <Badge tone="muted">—</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {offline ? (
                          <Badge tone="warning" dot>
                            Offline
                          </Badge>
                        ) : (
                          <Badge tone="success" dot>
                            Online
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button size="sm" variant="secondary" onClick={() => setSelected(student)}>
                          Check-in
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Live alert list */}
        <section className="rounded-lg border border-line bg-white shadow-panel">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">Live alerts</h2>
              <p className="text-2xs text-ink-faint">Most recent first</p>
            </div>
            {unreadAlerts.length > 1 ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={ackBusy}
                onClick={() => acknowledge(unreadAlerts.map((alert) => alert.id))}
              >
                Acknowledge all
              </Button>
            ) : null}
          </div>

          <div className="max-h-[420px] divide-y divide-line overflow-y-auto scroll-thin">
            {(snapshot?.alerts ?? []).length === 0 ? (
              <EmptyState
                icon={<BellRing className="h-5 w-5" />}
                title="No alerts"
                description="Threshold breaches appear here in real time."
              />
            ) : (
              (snapshot?.alerts ?? []).map((alert: AlertDTO) => (
                <article key={alert.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={alert.severity === 'CRITICAL' ? 'danger' : 'warning'}>
                      {alert.severity === 'CRITICAL' ? 'Critical' : 'Warning'}
                    </Badge>
                    <span className="text-2xs text-ink-faint" title={alert.timestamp}>
                      {relativeTime(alert.timestamp)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-ink-muted">{alert.message}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-2xs text-ink-faint">
                      {alert.studentName}
                      {alert.isRead ? ' · acknowledged' : ''}
                    </span>
                    {!alert.isRead ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ackBusy}
                        onClick={() => acknowledge([alert.id])}
                        icon={<Signal className="h-3 w-3" />}
                      >
                        Ack
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <StudentModal
        student={selected}
        teacher={null}
        authorName={authorName}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
