'use client';

import { useNow } from '@/hooks/use-live-feed';
import { api } from '@/lib/client';
import { relativeTime } from '@/lib/format';
import type { LiveMetrics } from '@/lib/types';
import { Cctv, HeartPulse, Radio, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

interface StatusPayload {
  metrics: LiveMetrics;
  seq: number;
  updatedAt: string;
}

interface MetricProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  tone: 'default' | 'success' | 'warning' | 'danger';
}

const toneStyles = {
  default: 'text-ink',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  danger: 'text-rose-600',
};

/**
 * Entry-page status strip. Polls the public aggregate endpoint — the payload
 * carries counts only, never student-identifying data.
 */
export function SystemStatusStrip() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [online, setOnline] = useState(false);
  const now = useNow(10_000);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const payload = await api<StatusPayload>('/api/status');
        if (!alive) return;
        setStatus(payload);
        setOnline(true);
      } catch {
        if (alive) setOnline(false);
      }
    };
    void load();
    const interval = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const metrics = status?.metrics;

  const items: MetricProps[] = [
    {
      icon: <HeartPulse className="h-4 w-4" />,
      label: 'Sensors online',
      value: metrics ? `${metrics.onlineSensors} / ${metrics.activeStudents}` : '—',
      note: 'wearable biometric band',
      tone: metrics && metrics.onlineSensors < metrics.activeStudents ? 'warning' : 'success',
    },
    {
      icon: <Cctv className="h-4 w-4" />,
      label: 'Camera streams',
      value: metrics ? `${metrics.connectedStreams} connected` : '—',
      note: 'NAS / NVR endpoints',
      tone: metrics && metrics.connectedStreams === 0 ? 'warning' : 'default',
    },
    {
      icon: <ShieldAlert className="h-4 w-4" />,
      label: 'Active health flags',
      value: metrics ? String(metrics.activeFlags) : '—',
      note: 'readings outside threshold',
      tone: metrics && metrics.activeFlags > 0 ? 'danger' : 'success',
    },
    {
      icon: <Radio className="h-4 w-4" />,
      label: 'Engine',
      value: online ? 'Streaming' : status ? 'Disconnected' : 'Starting',
      note: status
        ? `seq #${status.seq} · ${relativeTime(status.updatedAt, now)}`
        : online
          ? 'awaiting snapshot'
          : 'public status feed',
      tone: online ? 'success' : 'danger',
    },
  ];

  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-white px-4 py-3">
          <div className="flex items-center gap-1.5 text-ink-faint">
            {item.icon}
            <span className="text-2xs font-medium uppercase tracking-wide">{item.label}</span>
          </div>
          <p className={`mt-1.5 text-lg font-semibold tabular ${toneStyles[item.tone]}`}>
            {item.value}
          </p>
          <p className="mt-0.5 truncate text-2xs text-ink-faint">{item.note}</p>
        </div>
      ))}
    </div>
  );
}
