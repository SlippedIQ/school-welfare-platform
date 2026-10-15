'use client';

import { useLiveFeed, useNow } from '@/hooks/use-live-feed';
import { relativeTime } from '@/lib/format';
import { Cctv, HeartPulse, Radio, ShieldAlert } from 'lucide-react';

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

/** Entry-page status strip backed by the live simulation snapshot. */
export function SystemStatusStrip() {
  const { snapshot, status } = useLiveFeed();
  const now = useNow(5000);

  const metrics = snapshot?.metrics;

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
      value:
        status === 'live'
          ? 'Streaming'
          : status === 'polling'
            ? 'Polling'
            : status === 'offline'
              ? 'Disconnected'
              : 'Starting',
      note: snapshot ? `seq #${snapshot.seq} · ${relativeTime(snapshot.updatedAt, now)}` : 'awaiting snapshot',
      tone: status === 'live' ? 'success' : status === 'offline' ? 'danger' : 'default',
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
