'use client';

import { Sparkline } from '@/components/live/sparkline';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { useNow } from '@/hooks/use-live-feed';
import { cn } from '@/lib/cn';
import { formatTemp, initials, relativeTime } from '@/lib/format';
import {
  readingBand,
  STATE_LABELS,
  type BioState,
  type HealthBand,
  type LiveStudentDTO,
  type StressLevel,
  type StudentDTO,
} from '@/lib/types';
import { Brain, Crosshair, Moon, Zap } from 'lucide-react';

const stateConfig: Record<BioState, { tone: BadgeTone; icon: React.ReactNode }> = {
  FOCUSED: { tone: 'info', icon: <Crosshair className="h-3 w-3" /> },
  ACTIVE: { tone: 'success', icon: <Zap className="h-3 w-3" /> },
  SLEEPY: { tone: 'neutral', icon: <Moon className="h-3 w-3" /> },
  ANXIOUS: { tone: 'warning', icon: <Brain className="h-3 w-3" /> },
};

const stressTone: Record<StressLevel, BadgeTone> = {
  LOW: 'success',
  MODERATE: 'warning',
  HIGH: 'danger',
};

const bandConfig: Record<HealthBand, { tone: BadgeTone; label: string }> = {
  NORMAL: { tone: 'success', label: 'Normal' },
  ELEVATED: { tone: 'warning', label: 'Elevated' },
  CRITICAL: { tone: 'danger', label: 'Critical' },
};

interface StudentCardProps {
  student: StudentDTO;
  live: LiveStudentDTO | null;
  onOpen: (studentId: string) => void;
}

/** Live biometric tile for one student inside the class dashboard grid. */
export function StudentCard({ student, live, onOpen }: StudentCardProps) {
  const now = useNow(1000);

  const offline = !live || live.sensorStatus === 'OFFLINE';
  const band =
    live && !offline
      ? readingBand(live.heartRate, student.baselineHeartRate, live.bodyTemp)
      : 'NORMAL';
  const bandMeta = bandConfig[band];

  const updatedSeconds = live
    ? Math.max(0, Math.round((now - new Date(live.updatedAt).getTime()) / 1000))
    : null;

  const state = live?.state ?? 'FOCUSED';
  const stateMeta = stateConfig[state];

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(student.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(student.id);
        }
      }}
      className={cn(
        'cursor-pointer rounded-lg border bg-white p-3.5 text-left shadow-panel transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        band === 'CRITICAL'
          ? 'border-rose-200 bg-rose-50/40'
          : band === 'ELEVATED'
            ? 'border-amber-200 bg-amber-50/30'
            : 'border-line hover:border-line-strong',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-xs font-semibold text-ink-muted">
            {initials(student.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-4 text-ink">{student.fullName}</p>
            <p className="mt-0.5 truncate text-2xs text-ink-faint">
              {student.admissionNo} · {student.gradeClass}
            </p>
          </div>
        </div>
        <Badge tone={stateMeta.tone} className="shrink-0">
          <span className="text-ink-muted">{stateMeta.icon}</span>
          {STATE_LABELS[state]}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-2xs uppercase tracking-wide text-ink-faint">Heart rate</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-2xl font-semibold leading-6 tabular text-ink">
              {offline ? '—' : live!.heartRate}
            </span>
            <span className="text-2xs text-ink-faint">BPM</span>
            <Badge tone={offline ? 'muted' : bandMeta.tone} className="ml-auto">
              {offline ? 'No signal' : bandMeta.label}
            </Badge>
          </div>
          <Sparkline
            values={live?.trend ?? []}
            baseline={student.baselineHeartRate}
            band={band}
            height={34}
            className="mt-1.5"
          />
        </div>

        <div className="space-y-1.5">
          <div>
            <p className="text-2xs uppercase tracking-wide text-ink-faint">Temperature</p>
            <p className="mt-0.5 text-sm font-medium tabular text-ink">
              {offline ? '—' : formatTemp(live!.bodyTemp)}
            </p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-ink-faint">Stress</p>
            <div className="mt-0.5">
              <Badge tone={offline ? 'muted' : stressTone[live!.stressLevel]}>
                {offline ? '—' : live!.stressLevel}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-ink-faint">Baseline</p>
            <p className="mt-0.5 text-sm tabular text-ink-muted">
              {student.baselineHeartRate} BPM
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-2xs text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              offline ? 'bg-ink-faint' : 'bg-emerald-500 animate-pulse-dot',
            )}
          />
          {offline ? 'Sensor offline' : 'Sensor online'}
        </span>
        <span title="Last reading received">
          {updatedSeconds === null ? 'no data' : relativeTime(now - updatedSeconds * 1000, now)}
        </span>
      </div>
    </article>
  );
}
