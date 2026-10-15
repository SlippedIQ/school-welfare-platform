/** Formatting helpers shared across both portals. */

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatClock(iso: string | number | Date): string {
  const date = toDate(iso);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatTime(iso: string | number | Date): string {
  return toDate(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDateTime(iso: string | number | Date): string {
  const date = toDate(iso);
  const day = date.toLocaleDateString([], { day: '2-digit', month: 'short' });
  return `${day} · ${formatTime(date)}`;
}

/** Compact "2m ago" / "just now" labels for feeds and timestamps. */
export function relativeTime(iso: string | number | Date, now = Date.now()): string {
  const deltaSeconds = Math.max(0, Math.floor((now - toDate(iso).getTime()) / 1000));
  if (deltaSeconds < 5) return 'just now';
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Standardises a section label from a class name:
 * "Grade 9-A" -> "9-A", "Class 8 C" -> "8 C".
 */
export function deriveSection(className: string): string {
  const trimmed = className.trim();
  const match = /^(grade|class|std|standard)\s+(.+)$/i.exec(trimmed);
  return (match ? match[2] : trimmed).trim();
}

export function formatTemp(value: number): string {
  return `${value.toFixed(1)} °C`;
}

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}
