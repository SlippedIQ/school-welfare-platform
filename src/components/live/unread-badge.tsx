'use client';

import { useLiveFeed } from '@/hooks/use-live-feed';
import { cn } from '@/lib/cn';

/** Compact unread-count pill for sidebar navigation items. */
export function UnreadAlertBadge() {
  const { snapshot } = useLiveFeed();
  const unread = (snapshot?.alerts ?? []).filter((alert) => !alert.isRead).length;

  if (unread === 0) return null;

  return (
    <span
      className={cn(
        'flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1',
        'bg-rose-500 text-[10px] font-semibold leading-none text-white',
      )}
    >
      {unread > 9 ? '9+' : unread}
    </span>
  );
}
