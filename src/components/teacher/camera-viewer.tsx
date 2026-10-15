'use client';

import { useLiveFeed, useNow } from '@/hooks/use-live-feed';
import { cn } from '@/lib/cn';
import { formatClock } from '@/lib/format';
import { readingBand, type ClassroomDTO, type LiveStudentDTO, type StudentDTO } from '@/lib/types';
import { Cctv, Expand, Pause, Play, RefreshCw, Shrink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface CameraViewerProps {
  classroom: ClassroomDTO | null;
  students: StudentDTO[];
  liveStudents: Map<string, LiveStudentDTO>;
}

interface Dot {
  id: string;
  label: string;
  col: number;
  row: number;
  phase: number;
  speed: number;
  color: string;
}

const BAND_COLORS = {
  NORMAL: '#34d399',
  ELEVATED: '#fbbf24',
  CRITICAL: '#fb7185',
  OFFLINE: '#4b5563',
} as const;

/**
 * Mock NAS/NVR camera panel. Renders a deterministic top-down schematic of the
 * classroom (desks + occupant dots coloured by live health band) on canvas,
 * with connection states driven by the classroom's stream gateway config and
 * the simulated link health from the live feed.
 */
export function CameraViewer({ classroom, students, liveStudents }: CameraViewerProps) {
  const { snapshot } = useLiveFeed();
  const now = useNow(1000);

  const [handshaking, setHandshaking] = useState(true);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dotsRef = useRef<Dot[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const stream = snapshot
    ? snapshot.streams.find((entry) => entry.classroomId === classroom?.id) ?? null
    : null;

  const configured = Boolean(classroom?.streamUrl);
  const mode: 'no-signal' | 'connecting' | 'reconnecting' | 'live' = !configured
    ? 'no-signal'
    : handshaking
      ? 'connecting'
      : stream && !stream.online
        ? 'reconnecting'
        : 'live';

  // Re-run the mock handshake whenever the selected section changes.
  useEffect(() => {
    if (!classroom?.streamUrl) {
      setHandshaking(false);
      return;
    }
    setHandshaking(true);
    const timer = window.setTimeout(() => setHandshaking(false), 750);
    return () => window.clearTimeout(timer);
  }, [classroom?.id, classroom?.streamUrl]);

  // Recompute desk positions whenever the roster or health bands change.
  dotsRef.current = buildDots(students, liveStudents);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let raf = 0;
    let lastWidth = 0;
    let lastHeight = 0;

    const render = (time: number) => {
      raf = requestAnimationFrame(render);

      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(parent.clientWidth * dpr));
      const height = Math.max(1, Math.floor(parent.clientHeight * dpr));
      if (width !== lastWidth || height !== lastHeight) {
        canvas.width = width;
        canvas.height = height;
        lastWidth = width;
        lastHeight = height;
      }

      if (pausedRef.current) return;
      drawFrame(context, canvas.width, canvas.height, time, dotsRef.current);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section
      className={cn(
        'flex flex-col overflow-hidden',
        expanded
          ? 'fixed inset-3 z-50 rounded-xl border border-line bg-white shadow-overlay'
          : 'rounded-lg border border-line bg-white shadow-panel',
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Cctv className="h-4 w-4 shrink-0 text-ink-faint" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-ink">
              {classroom ? `${classroom.className} camera` : 'Classroom camera'}
            </h3>
            <p className="truncate text-2xs text-ink-faint">
              {classroom ? `NAS ${classroom.nasId}` : 'No section selected'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-label={paused ? 'Resume feed' : 'Pause feed'}
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? 'Collapse feed' : 'Expand feed'}
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            {expanded ? <Shrink className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      <div
        className={cn(
          'camera-surface relative',
          expanded ? 'flex-1' : 'aspect-video',
        )}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {/* Status overlays */}
        {mode !== 'live' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/70 text-center">
            {mode === 'no-signal' ? (
              <>
                <Cctv className="h-6 w-6 text-white/40" />
                <p className="text-sm font-medium text-white/90">No stream configured</p>
                <p className="max-w-xs text-xs text-white/60">
                  Map a stream gateway path to this section in Admin → Classrooms &amp; cameras.
                </p>
              </>
            ) : mode === 'connecting' ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin text-white/70" />
                <p className="text-sm text-white/80">Initializing stream…</p>
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                </span>
                <p className="text-sm text-white/80">Reconnecting to NAS…</p>
                <p className="text-xs text-white/50">Retry window 6–15 s</p>
              </>
            )}
          </div>
        ) : null}

        {paused && mode === 'live' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/50">
            <span className="rounded-md border border-white/20 px-2.5 py-1 text-xs font-medium text-white/90">
              Paused
            </span>
          </div>
        ) : null}

        {/* HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-3 py-2 text-[10px] font-medium uppercase tracking-wider">
          <span className="inline-flex items-center gap-1.5 rounded bg-black/50 px-1.5 py-0.5 text-white/80">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                mode === 'live' ? 'bg-rose-500 animate-pulse-dot' : 'bg-white/40',
              )}
            />
            {mode === 'live' ? 'Live' : mode === 'no-signal' ? 'Off' : 'Sync'}
          </span>
          <span className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-white/70">
            {classroom?.nasId ?? '—'}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-3 py-2 font-mono text-[10px] text-white/70">
          <span className="rounded bg-black/50 px-1.5 py-0.5 tabular">{formatClock(now)}</span>
          <span className="rounded bg-black/50 px-1.5 py-0.5 tabular">
            {stream && stream.online
              ? `${(stream.bitrateKbps / 1000).toFixed(1)} Mbps · ${stream.latencyMs} ms`
              : configured
                ? 'no link'
                : 'no gateway'}
          </span>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Canvas rendering                                                           */
/* -------------------------------------------------------------------------- */

function buildDots(students: StudentDTO[], liveStudents: Map<string, LiveStudentDTO>): Dot[] {
  const count = students.length;
  if (count === 0) return [];

  const columns = Math.ceil(Math.sqrt(count * 1.7));

  return students.map((student, index) => {
    const live = liveStudents.get(student.id);
    const color =
      !live || live.sensorStatus === 'OFFLINE'
        ? BAND_COLORS.OFFLINE
        : BAND_COLORS[readingBand(live.heartRate, student.baselineHeartRate, live.bodyTemp)];

    return {
      id: student.id,
      label: student.fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join(''),
      col: index % columns,
      row: Math.floor(index / columns),
      phase: (index * 1.7) % (Math.PI * 2),
      speed: 0.6 + ((index * 37) % 100) / 100,
      color,
    };
  });
}

function drawFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  dots: Dot[],
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#0b0f14';
  context.fillRect(0, 0, width, height);

  drawGrid(context, width, height);

  if (dots.length === 0) return;

  // Desk grid geometry derived from the dot list.
  const columns = Math.max(...dots.map((dot) => dot.col)) + 1;
  const rows = Math.max(...dots.map((dot) => dot.row)) + 1;
  const marginX = width * 0.1;
  const marginY = height * 0.22;
  const cellW = (width - marginX * 2) / columns;
  const cellH = (height - marginY * 2) / rows;
  const deskW = cellW * 0.58;
  const deskH = cellH * 0.34;

  for (const dot of dots) {
    const cx = marginX + dot.col * cellW + cellW / 2;
    const cy = marginY + dot.row * cellH + cellH / 2;

    // Desk
    context.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    context.fillStyle = 'rgba(15, 23, 42, 0.85)';
    context.lineWidth = 1;
    roundedRect(context, cx - deskW / 2, cy - deskH / 2, deskW, deskH, 3);
    context.fill();
    context.stroke();

    // Occupant: slow, subtle movement around the desk.
    const jitterX = Math.sin(time * 0.0006 * dot.speed + dot.phase) * cellW * 0.05;
    const jitterY = Math.cos(time * 0.0005 * dot.speed + dot.phase) * cellH * 0.06;
    const personX = cx + jitterX;
    const personY = cy + deskH / 2 + cellH * 0.09 + jitterY;

    context.beginPath();
    context.arc(personX, personY, Math.max(3, deskH * 0.16), 0, Math.PI * 2);
    context.fillStyle = dot.color;
    context.shadowColor = dot.color;
    context.shadowBlur = 8;
    context.fill();
    context.shadowBlur = 0;

    // Label
    context.font = `${Math.max(8, Math.round(cellH * 0.085))}px ui-monospace, monospace`;
    context.fillStyle = 'rgba(203, 213, 225, 0.55)';
    context.textAlign = 'center';
    context.fillText(dot.label, personX, personY + deskH * 0.42);
  }

  // Slow scanline sweep for a video-feed feel.
  const scanY = (time * 0.03) % height;
  const gradient = context.createLinearGradient(0, scanY - 24, 0, scanY + 24);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.035)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, scanY - 24, width, 48);

  // Vignette
  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.3,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number) {
  context.strokeStyle = 'rgba(148, 163, 184, 0.05)';
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += 28) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 28) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}
