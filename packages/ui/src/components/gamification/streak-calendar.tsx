import { cn } from '@ui/lib/cn';

export interface StreakCalendarDay {
  /** e.g. "Mon" or a date — shown visibly, not just to a screen reader. */
  label: string;
  active: boolean;
}

export interface StreakCalendarProps {
  days: StreakCalendarDay[];
  className?: string;
}

/**
 * E3 §12.2/§12.5 streak calendar — "presentational, list semantics": a
 * real `<ul>` of day cells. Active/inactive is conveyed by a filled vs.
 * unfilled square (shape+color together, not color alone) *and* a full
 * text alternative per cell — the visible day label alone ("Mon") isn't
 * enough on its own to convey practiced/not-practiced.
 */
export function StreakCalendar({ days, className }: StreakCalendarProps) {
  return (
    <ul className={cn('flex gap-2', className)}>
      {days.map((day, index) => (
        <li key={index} className="flex flex-col items-center gap-1">
          <span
            aria-hidden="true"
            className={cn(
              'h-6 w-6 rounded-md',
              day.active ? 'bg-warning-solid' : 'bg-surface-muted',
            )}
          />
          <span aria-hidden="true" className="type-caption text-neutral-text">
            {day.label}
          </span>
          <span className="sr-only">
            {day.label}: {day.active ? 'practiced' : 'not practiced'}
          </span>
        </li>
      ))}
    </ul>
  );
}
