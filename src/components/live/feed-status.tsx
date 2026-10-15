'use client';

import { cn } from '@/lib/cn';
import { useLiveFeed } from '@/hooks/use-live-feed';

const statusStyles = {
  connecting: { dot: 'bg-ink-faint', label: 'Connecting', className: 'border-line text-ink-muted' },
  live: { dot: 'bg-emerald-500 animate-pulse-dot', label: 'Live feed', className: 'border-emerald-200 text-emerald-700' },
  polling: { dot: 'bg-amber-500', label: 'Polling', className: 'border-amber-200 text-amber-700' },
  offline: { dot: 'bg-rose-500', label: 'Disconnected', className: 'border-rose-200 text-rose-700' },
} as const;

/** Compact transport indicator shown in the top bar of both portals. */
export function FeedStatusPill({ className }: { className?: string }) {
  const { status, snapshot } = useLiveFeed();
  const style = statusStyles[status];

  const title = snapshot
    ? `Engine seq #${snapshot.seq} · updated ${new Date(snapshot.updatedAt).toLocaleTimeString()}`
    : 'Waiting for the first simulation snapshot';

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-2xs font-medium',
        style.className,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}
