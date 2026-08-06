import * as React from 'react';

import { cn } from '@ui/lib/cn';

export interface ProgressBarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Current value, in the same units as `max`. */
  value: number;
  max?: number;
  /** The accessible name (§12.5: "text alternative") — e.g. "Lesson progress: 60%". */
  label: string;
  /** Shows a value/max caption above the bar (e.g. "6 / 10"). Purely visual — `label` is what a screen reader gets either way. */
  showValueText?: boolean;
}

/** E3 §12.2/§12.5 linear progress bar — `role="progressbar"` + `aria-valuenow/min/max`, always with a text alternative. */
export function ProgressBar({
  value,
  max = 100,
  label,
  showValueText = false,
  className,
  ...props
}: ProgressBarProps) {
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? (clamped / max) * 100 : 0;

  return (
    <div className={cn('flex flex-col gap-1', className)} {...props}>
      {showValueText && (
        <span className="type-caption text-neutral-text">
          {clamped} / {max}
        </span>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-pill bg-surface-muted"
      >
        <div
          className="h-full rounded-pill bg-primary-solid transition-[width] duration-standard ease-entrance"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
