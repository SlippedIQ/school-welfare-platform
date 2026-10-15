'use client';

import { AlertTicker } from '@/components/live/alerts-dock';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DistributionRow } from '@/components/ui/distribution-row';
import { EmptyState } from '@/components/ui/feedback';
import { StatCard } from '@/components/ui/stat-card';
import { useLiveFeed, useNow } from '@/hooks/use-live-feed';
import { cn } from '@/lib/cn';
import { formatDateTime, relativeTime } from '@/lib/format';
import {
  BIO_STATES,
  STATE_LABELS,
  STRESS_LEVELS,
  type ClassroomDTO,
  type Severity,
  type StressLevel,
} from '@/lib/types';
import {
  Activity,
  Cctv,
  HeartPulse,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  TriangleAlert,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

interface AdminOverviewProps {
  classrooms: ClassroomDTO[];
  studentCount: number;
}

interface CheckState {
  checking: boolean;
  message: string | null;
}

const stateColors: Record<(typeof BIO_STATES)[number], string> = {
  FOCUSED: 'bg-sky-500',
  ACTIVE: 'bg-emerald-500',
  SLEEPY: 'bg-zinc-400',
  ANXIOUS: 'bg-amber-500',
};

const stressColors: Record<StressLevel, string> = {
  LOW: 'bg-emerald-500',
  MODERATE: 'bg-amber-500',
  HIGH: 'bg-rose-500',
};

const stressLabels: Record<StressLevel, string> = {
  LOW: 'Low',
  MODERATE: 'Moderate',
  HIGH: 'High',
};

/** Admin landing view: school-wide metrics, wellness distribution, camera health. */
export function AdminOverview({ classrooms, studentCount }: AdminOverviewProps) {
  const { snapshot } = useLiveFeed();
  const now = useNow(5000);

  // Read the freshest snapshot inside async callbacks without stale closures.
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const [checks, setChecks] = useState<Record<string, CheckState>>({});

  const metrics = snapshot?.metrics;
  const liveStudents = snapshot?.students ?? [];
  const recentAlerts = (snapshot?.alerts ?? []).slice(0, 8);

  const stateCounts = BIO_STATES.map((state) => ({
    state,
    count: liveStudents.filter((student) => student.state === state).length,
  }));

  const stressCounts = STRESS_LEVELS.map((level) => ({
    level,
    count: liveStudents.filter(
      (student) => student.sensorStatus === 'ONLINE' && student.stressLevel === level,
    ).length,
  }));

  const sensorsHealthy = metrics ? metrics.onlineSensors === metrics.activeStudents : true;

  function runGatewayCheck(classroomId: string) {
    setChecks((current) => ({ ...current, [classroomId]: { checking: true, message: null } }));

    window.setTimeout(() => {
      const stream =
        snapshotRef.current?.streams.find((entry) => entry.classroomId === classroomId) ?? null;

      setChecks((current) => ({
        ...current,
        [classroomId]: {
          checking: false,
          message: stream?.online
            ? `Gateway reachable · ${stream.latencyMs} ms round-trip`
            : 'Timeout — no response from the NAS gateway',
        },
      }));
    }, 700);
  }

  return (
    <div className="space-y-4">
      <AlertTicker />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active students"
          value={metrics?.activeStudents ?? studentCount}
          icon={<Users className="h-4 w-4" />}
          note={`enrolled across ${classrooms.length} section${classrooms.length === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Online sensors"
          value={
            metrics ? `${metrics.onlineSensors} / ${metrics.activeStudents}` : '—'
          }
          icon={<HeartPulse className="h-4 w-4" />}
          tone={sensorsHealthy ? 'success' : 'warning'}
          note={
            sensorsHealthy
              ? 'all wearables reporting'
              : 'some wearables are not reporting'
          }
        />
        <StatCard
          label="Connected streams"
          value={metrics ? `${metrics.connectedStreams} / ${classrooms.length}` : '—'}
          icon={<Cctv className="h-4 w-4" />}
          tone={
            metrics && metrics.connectedStreams < classrooms.length ? 'warning' : 'default'
          }
          note="NAS / NVR camera endpoints"
        />
        <StatCard
          label="Active health flags"
          value={metrics ? metrics.activeFlags : '—'}
          icon={<ShieldAlert className="h-4 w-4" />}
          tone={metrics && metrics.activeFlags > 0 ? 'danger' : 'success'}
          note="students currently outside threshold"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <Card>
            <CardHeader
              title="Live wellness snapshot"
              description={`School-wide distribution across ${liveStudents.length} reporting sensors`}
            />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-ink-faint">
                  Behavioural state
                </p>
                <div className="mt-2 space-y-1.5">
                  {stateCounts.map(({ state, count }) => (
                    <DistributionRow
                      key={state}
                      label={STATE_LABELS[state]}
                      count={count}
                      total={liveStudents.length}
                      colorClass={stateColors[state]}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-ink-faint">
                  Stress level
                </p>
                <div className="mt-2 space-y-1.5">
                  {stressCounts.map(({ level, count }) => (
                    <DistributionRow
                      key={level}
                      label={stressLabels[level]}
                      count={count}
                      total={liveStudents.length}
                      colorClass={stressColors[level]}
                    />
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent flags"
              description="Latest health and stress events across the school"
              actions={
                <Link
                  href="/admin/audit"
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
                >
                  <ScrollText className="h-3.5 w-3.5" />
                  Open audit log
                </Link>
              }
            />
            {recentAlerts.length === 0 ? (
              <EmptyState
                icon={<Activity className="h-5 w-5" />}
                title="No flags yet"
                description="Threshold breaches appear here as the simulation engine detects them."
              />
            ) : (
              <ul className="divide-y divide-line">
                {recentAlerts.map((alert) => (
                  <li key={alert.id} className="flex items-start gap-3 px-4 py-2.5">
                    <SeverityIcon severity={alert.severity} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-ink">{alert.message}</p>
                      <p className="mt-0.5 text-2xs text-ink-faint">
                        {alert.gradeClass ?? 'Unassigned'} ·{' '}
                        <span title={formatDateTime(alert.timestamp)}>
                          {relativeTime(alert.timestamp, now)}
                        </span>
                      </p>
                    </div>
                    <Badge tone={alert.isRead ? 'muted' : alert.severity === 'CRITICAL' ? 'danger' : 'warning'}>
                      {alert.isRead ? 'Read' : alert.severity === 'CRITICAL' ? 'Critical' : 'Warning'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="xl:col-span-5">
          <Card className="h-full">
            <CardHeader
              title="Camera & NAS status"
              description="Live link health per section"
            />
            <CardBody className="space-y-0">
              {classrooms.length === 0 ? (
                <EmptyState
                  icon={<Cctv className="h-5 w-5" />}
                  title="No classrooms configured"
                  description="Add a section with its NAS identifier under Classrooms & cameras."
                />
              ) : (
                classrooms.map((classroom) => {
                  const stream =
                    snapshot?.streams.find((entry) => entry.classroomId === classroom.id) ??
                    null;
                  const configured = classroom.streamUrl.trim().length > 0;
                  const check = checks[classroom.id];

                  return (
                    <div
                      key={classroom.id}
                      className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {classroom.className}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-2xs text-ink-faint">
                          {classroom.nasId} ·{' '}
                          {configured ? classroom.streamUrl : 'no gateway configured'}
                        </p>
                        {check?.message ? (
                          <p
                            className={cn(
                              'mt-1 text-2xs',
                              check.message.startsWith('Gateway')
                                ? 'text-emerald-600'
                                : 'text-rose-600',
                            )}
                          >
                            {check.message}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {!configured ? (
                          <Badge tone="muted">Unconfigured</Badge>
                        ) : stream?.online ? (
                          <Badge tone="success" dot>
                            Live
                          </Badge>
                        ) : (
                          <Badge tone="warning" dot>
                            Reconnecting
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!configured || (check?.checking ?? false)}
                          icon={
                            <RefreshCw
                              className={cn('h-3 w-3', check?.checking && 'animate-spin')}
                            />
                          }
                          onClick={() => runGatewayCheck(classroom.id)}
                        >
                          {check?.checking ? 'Checking…' : 'Check'}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  const critical = severity === 'CRITICAL';
  return (
    <span
      className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
        critical
          ? 'border-rose-200 bg-rose-50 text-rose-600'
          : 'border-amber-200 bg-amber-50 text-amber-600',
      )}
    >
      {critical ? (
        <ShieldAlert className="h-3.5 w-3.5" />
      ) : (
        <TriangleAlert className="h-3.5 w-3.5" />
      )}
    </span>
  );
}
