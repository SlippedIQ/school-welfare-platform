'use client';

import { Sparkline } from '@/components/live/sparkline';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Field, Textarea } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useLiveStudent } from '@/hooks/use-live-feed';
import { api } from '@/lib/client';
import { cn } from '@/lib/cn';
import { formatDateTime, formatTemp, relativeTime } from '@/lib/format';
import {
  readingBand,
  STATE_LABELS,
  type BiometricPointDTO,
  type HealthBand,
  type ObservationDTO,
  type StudentDTO,
  type TeacherDTO,
} from '@/lib/types';
import { NotebookPen } from 'lucide-react';
import { useEffect, useState } from 'react';

interface StudentModalProps {
  student: StudentDTO | null;
  teacher: TeacherDTO | null;
  /** Overrides the note author (e.g. the signed-in nurse); defaults to the teacher. */
  authorName?: string;
  onClose: () => void;
}

interface StudentDetail {
  recentReadings: BiometricPointDTO[];
  observations: ObservationDTO[];
}

/** Quick health trends plus timestamped observation notes for one student. */
export function StudentModal({ student, teacher, authorName, onClose }: StudentModalProps) {
  const toast = useToast();
  const live = useLiveStudent(student?.id);

  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const studentId = student?.id ?? null;

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;

    setLoading(true);
    setDetail(null);
    setNote('');

    api<StudentDetail>(`/api/students/${studentId}`)
      .then((payload) => {
        if (!cancelled) setDetail(payload);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Could not load student detail');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, toast]);

  async function submitNote(event: React.FormEvent) {
    event.preventDefault();
    if (!student || note.trim().length < 4) return;

    setSaving(true);
    try {
      const created = await api<ObservationDTO>('/api/observations', {
        method: 'POST',
        body: JSON.stringify({
          studentId: student.id,
          teacherId: teacher?.id ?? null,
          authorName: authorName ?? teacher?.name ?? 'Staff',
          note: note.trim(),
        }),
      });
      setDetail((current) =>
        current ? { ...current, observations: [created, ...current.observations] } : current,
      );
      setNote('');
      toast.success('Observation recorded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save observation');
    } finally {
      setSaving(false);
    }
  }

  const band =
    live && live.sensorStatus === 'ONLINE'
      ? readingBand(live.heartRate, student?.baselineHeartRate ?? 0, live.bodyTemp)
      : 'NORMAL';
  const offline = live?.sensorStatus === 'OFFLINE';

  const bandBadge =
    offline || !live
      ? { tone: 'muted' as BadgeTone, label: 'No signal' }
      : band === 'NORMAL'
        ? { tone: 'success' as BadgeTone, label: 'In range' }
        : band === 'ELEVATED'
          ? { tone: 'warning' as BadgeTone, label: 'Elevated' }
          : { tone: 'danger' as BadgeTone, label: 'Critical' };

  const heartRateSeries = (detail?.recentReadings ?? []).map((reading) => reading.heartRate);
  const tempSeries = (detail?.recentReadings ?? []).map((reading) => reading.bodyTemp);
  const recentStates = (detail?.recentReadings ?? []).slice(-12).reverse();

  return (
    <Modal
      open={Boolean(student)}
      onClose={onClose}
      width="lg"
      title={student?.fullName ?? 'Student'}
      description={
        student
          ? `${student.admissionNo} · ${student.gradeClass} · age ${student.age} · guardian ${student.guardianContact}`
          : undefined
      }
    >
      {student ? (
        <div className="space-y-5">
          {/* Live summary strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricTile
              label="Heart rate"
              value={live && !offline ? `${live.heartRate}` : '—'}
              unit="BPM"
              badge={bandBadge}
              note={`baseline ${student.baselineHeartRate}`}
            />
            <MetricTile
              label="Temperature"
              value={live && !offline ? formatTemp(live.bodyTemp) : '—'}
              badge={null}
              note="continuous"
            />
            <MetricTile
              label="Stress"
              value={live && !offline ? live.stressLevel : '—'}
              badge={null}
              note="composite index"
            />
            <MetricTile
              label="State"
              value={live ? STATE_LABELS[live.state] : '—'}
              badge={null}
              note={live ? `updated ${relativeTime(live.updatedAt)}` : 'no signal'}
            />
          </div>

          {/* Trends */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Last 30 readings
            </h3>
            {loading ? (
              <div className="mt-2 space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <TrendPanel
                  label="Heart rate (BPM)"
                  values={heartRateSeries}
                  baseline={student.baselineHeartRate}
                  band={band}
                />
                <TrendPanel label="Body temperature (°C)" values={tempSeries} decimals={1} />
              </div>
            )}

            {recentStates.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {recentStates.map((reading) => (
                  <span
                    key={reading.timestamp}
                    title={`${formatDateTime(reading.timestamp)} · ${reading.heartRate} BPM · ${formatTemp(reading.bodyTemp)}`}
                    className="rounded border border-line bg-surface-muted px-1.5 py-0.5 text-2xs text-ink-muted"
                  >
                    {new Date(reading.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}{' '}
                    · {STATE_LABELS[reading.state]}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          {/* Observations */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Observations
            </h3>

            <form onSubmit={submitNote} className="mt-2">
              <Field
                label="Add timestamped note"
                hint="Recorded with your name and the current time."
              >
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="e.g. Seemed distracted during the quiz, asked for water twice."
                  maxLength={600}
                />
              </Field>
              <div className="mt-2 flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={saving || note.trim().length < 4}
                  icon={<NotebookPen className="h-3.5 w-3.5" />}
                >
                  {saving ? 'Saving…' : 'Save note'}
                </Button>
              </div>
            </form>

            <div className="mt-3 divide-y divide-line rounded-lg border border-line">
              {(detail?.observations ?? []).length === 0 && !loading ? (
                <EmptyState
                  icon={<NotebookPen className="h-5 w-5" />}
                  title="No observations yet"
                  description="Notes appear here for every staff member who supervises this student."
                />
              ) : (
                (detail?.observations ?? []).map((observation) => (
                  <article key={observation.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xs font-medium text-ink">{observation.authorName}</span>
                      <span
                        className="text-2xs text-ink-faint"
                        title={formatDateTime(observation.createdAt)}
                      >
                        {relativeTime(observation.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">{observation.note}</p>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </Modal>
  );
}

function MetricTile({
  label,
  value,
  unit,
  badge,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  badge: { tone: BadgeTone; label: string } | null;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-muted px-3 py-2.5">
      <p className="text-2xs uppercase tracking-wide text-ink-faint">{label}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-semibold tabular leading-5 text-ink">{value}</span>
        {unit ? <span className="text-2xs text-ink-faint">{unit}</span> : null}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : <span />}
        {note ? <span className="truncate text-2xs text-ink-faint">{note}</span> : null}
      </div>
    </div>
  );
}

function TrendPanel({
  label,
  values,
  baseline,
  band,
  decimals,
}: {
  label: string;
  values: number[];
  baseline?: number;
  band?: HealthBand;
  decimals?: number;
}) {
  const latest = values.length > 0 ? values[values.length - 1] : null;
  const min = values.length > 0 ? Math.min(...values) : null;
  const max = values.length > 0 ? Math.max(...values) : null;

  const format = (value: number) =>
    decimals ? value.toFixed(decimals) : String(Math.round(value));

  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs uppercase tracking-wide text-ink-faint">{label}</p>
        {latest !== null ? (
          <span className="text-sm font-semibold tabular text-ink">{format(latest)}</span>
        ) : null}
      </div>
      <Sparkline values={values} baseline={baseline} band={band} height={44} className="mt-1.5" />
      <div className={cn('mt-1 flex justify-between text-2xs tabular text-ink-faint')}>
        <span>{min !== null ? `min ${format(min)}` : '—'}</span>
        <span>{max !== null ? `max ${format(max)}` : '—'}</span>
      </div>
    </div>
  );
}
