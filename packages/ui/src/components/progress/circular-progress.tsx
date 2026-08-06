import { cn } from '@ui/lib/cn';

export interface CircularProgressProps {
  value: number;
  max?: number;
  /** The accessible name (§12.5: "text alternative") — e.g. "Spanish mastery: 72%". */
  label: string;
  /** Diameter, px. */
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/** E3 §12.2/§12.5 circular/ring progress (skill mastery) — same `role="progressbar"` contract as the linear bar. */
export function CircularProgress({
  value,
  max = 100,
  label,
  size = 48,
  strokeWidth = 4,
  className,
}: CircularProgressProps) {
  const clamped = Math.min(Math.max(value, 0), max);
  const fraction = max > 0 ? clamped / max : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fraction);

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn('inline-block', className)}
      style={{ width: size, height: size }}
    >
      {/* Rotated -90deg so the fill starts at 12 o'clock, the conventional orientation for a ring progress indicator. */}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-surface-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="fill-none stroke-primary-solid transition-[stroke-dashoffset] duration-standard ease-entrance"
        />
      </svg>
    </div>
  );
}
