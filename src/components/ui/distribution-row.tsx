import { cn } from '@/lib/cn';

interface DistributionRowProps {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}

/** Horizontal ratio bar used in the state/stress distribution panels. */
export function DistributionRow({ label, count, total, colorClass }: DistributionRowProps) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 truncate text-xs text-ink-muted">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
        <span
          className={cn('block h-full rounded-full transition-all duration-500', colorClass)}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="w-6 shrink-0 text-right text-xs tabular text-ink-muted">{count}</span>
    </div>
  );
}
