'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LiveSnapshot, LiveStudentDTO } from '@/lib/types';

export type FeedStatus = 'connecting' | 'live' | 'polling' | 'offline';

interface LiveFeedValue {
  snapshot: LiveSnapshot | null;
  status: FeedStatus;
}

const LiveFeedContext = createContext<LiveFeedValue>({
  snapshot: null,
  status: 'connecting',
});

/**
 * Subscribes to the simulation engine over Server-Sent Events and transparently
 * degrades to 4s short polling against `/api/live/snapshot` if the stream is
 * unavailable (e.g. running behind a proxy that buffers event streams).
 */
export function LiveFeedProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [status, setStatus] = useState<FeedStatus>('connecting');

  useEffect(() => {
    let disposed = false;
    let source: EventSource | null = null;
    let pollTimer: number | undefined;

    const apply = (payload: unknown, mode: 'sse' | 'poll' | 'initial') => {
      if (disposed || !payload || typeof payload !== 'object') return;
      const data = payload as LiveSnapshot;
      if (!Array.isArray(data.students)) return;
      setSnapshot(data);
      if (mode === 'sse') setStatus('live');
      else if (mode === 'poll') setStatus((prev) => (prev === 'offline' ? 'polling' : prev === 'live' ? 'live' : 'polling'));
    };

    const poll = async () => {
      try {
        const response = await fetch('/api/live/snapshot', { cache: 'no-store' });
        if (!response.ok) throw new Error(`snapshot ${response.status}`);
        apply(await response.json(), 'poll');
      } catch {
        if (!disposed) setStatus('offline');
      }
    };

    const startPolling = () => {
      if (pollTimer !== undefined) return;
      void poll();
      pollTimer = window.setInterval(() => void poll(), 4000);
    };

    // Instant snapshot so dashboards are populated before the stream connects.
    void poll().catch(() => undefined);

    try {
      source = new EventSource('/api/live');
      const onPayload = (event: Event) => {
        try {
          apply(JSON.parse((event as MessageEvent).data), 'sse');
        } catch {
          /* malformed frame — next tick will replace it */
        }
      };
      source.addEventListener('snapshot', onPayload);
      source.addEventListener('tick', onPayload);
      source.addEventListener('error', () => {
        source?.close();
        source = null;
        startPolling();
      });
    } catch {
      startPolling();
    }

    return () => {
      disposed = true;
      source?.close();
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
    };
  }, []);

  const value = useMemo<LiveFeedValue>(() => ({ snapshot, status }), [snapshot, status]);

  return <LiveFeedContext.Provider value={value}>{children}</LiveFeedContext.Provider>;
}

export function useLiveFeed(): LiveFeedValue {
  return useContext(LiveFeedContext);
}

/** Convenience selector for a single student's live reading. */
export function useLiveStudent(studentId: string | null | undefined): LiveStudentDTO | null {
  const { snapshot } = useLiveFeed();
  return useMemo(() => {
    if (!snapshot || !studentId) return null;
    return snapshot.students.find((student) => student.studentId === studentId) ?? null;
  }, [snapshot, studentId]);
}

/** Subscribes to clock ticks for relative timestamps without re-rendering the tree. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

/** Stable callback helper used by drawers and modals. */
export function useEventCallback<Args extends unknown[], R>(
  handler: (...args: Args) => R,
): (...args: Args) => R {
  const ref = useCallback((...args: Args) => handler(...args), [handler]);
  return ref;
}
