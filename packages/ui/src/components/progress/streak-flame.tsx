import { Flame } from '@ui/icons';
import { cn } from '@ui/lib/cn';

export interface StreakFlameProps {
  days: number;
  /** Whether today's practice has kept the streak alive. Defaults `true` — most renders show a live streak, not an at-risk one. */
  active?: boolean;
  className?: string;
}

/**
 * E3 §12.2 streak flame indicator. §12.5 groups this with the genuine
 * progress meters (linear/circular bars) under one accessibility-pattern
 * row, but a day-count has no min/max range to visualize — there's no
 * real progress value here, only a count and a live/at-risk state. Rather
 * than force a `role="progressbar"` with meaningless bounds onto it, this
 * satisfies the row's actual intent (a real, non-color-only text
 * alternative) with a plain accessible label instead.
 */
export function StreakFlame({ days, active = true, className }: StreakFlameProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Flame
        aria-hidden="true"
        className={cn('h-5 w-5', active ? 'text-warning-text' : 'text-disabled-text')}
      />
      <span className="type-body-sm font-semibold text-text">
        {days}
        <span className="sr-only">
          {' '}
          day{days === 1 ? '' : 's'} streak{active ? '' : ', at risk'}
        </span>
      </span>
    </span>
  );
}
