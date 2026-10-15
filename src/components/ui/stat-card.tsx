import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

type Tone = 'default' | 'success' | 'warning' | 'danger';

const toneClasses: Record<Tone, string> = {
  default: 'text-ink',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  danger: 'text-rose-600',
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  className?: string;
}

/** Single metric tile used across the admin overview. */
export function StatCard({ label, value, note, icon, tone = 'default', className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-line bg-white px-4 py-3.5 shadow-panel',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
        {icon ? <span className="text-ink-faint">{icon}</span> : null}
      </div>
      <p className={cn('mt-2 text-2xl font-semibold leading-7 tabular', toneClasses[tone])}>
        {value}
      </p>
      {note ? <p className="mt-1 truncate text-2xs text-ink-faint">{note}</p> : null}
    </div>
  );
}
