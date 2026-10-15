import { cn } from '@/lib/cn';
import type { HealthBand } from '@/lib/types';

const bandColors: Record<HealthBand, { line: string; fill: string }> = {
  NORMAL: { line: '#10b981', fill: '#10b981' },
  ELEVATED: { line: '#f59e0b', fill: '#f59e0b' },
  CRITICAL: { line: '#f43f5e', fill: '#f43f5e' },
};

interface SparklineProps {
  values: number[];
  /** Reference line drawn across the chart (student baseline). */
  baseline?: number;
  band?: HealthBand;
  height?: number;
  className?: string;
}

/**
 * Dependency-free SVG sparkline with a dashed baseline reference and a soft
 * area fill. Renders a flat placeholder line when there is not enough data.
 */
export function Sparkline({
  values,
  baseline,
  band = 'NORMAL',
  height = 36,
  className,
}: SparklineProps) {
  const color = bandColors[band];
  const width = 120;
  const padding = 3;

  if (values.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={cn('w-full', className)}
        style={{ height }}
        aria-hidden="true"
      >
        <line
          x1={padding}
          y1={height / 2}
          x2={width - padding}
          y2={height / 2}
          stroke="#e4e4e7"
          strokeWidth="1"
        />
      </svg>
    );
  }

  const candidates = baseline ? [...values, baseline] : values;
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const range = Math.max(1, max - min);

  const toX = (index: number) =>
    padding + (index / (values.length - 1)) * (width - padding * 2);
  const toY = (value: number) =>
    height - padding - ((value - min) / range) * (height - padding * 2);

  const points = values.map((value, index) => `${toX(index)},${toY(value)}`).join(' ');
  const areaPath = `${points} ${toX(values.length - 1)},${height - padding} ${toX(0)},${height - padding}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      style={{ height }}
      aria-hidden="true"
    >
      <polygon points={areaPath} fill={color.fill} fillOpacity="0.08" />
      {baseline ? (
        <line
          x1={padding}
          y1={toY(baseline)}
          x2={width - padding}
          y2={toY(baseline)}
          stroke="#a1a1aa"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      ) : null}
      <polyline
        points={points}
        fill="none"
        stroke={color.line}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
