import { cn } from '@ui/lib/cn';

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface CefrBadgeProps {
  level: CefrLevel;
  className?: string;
}

const LEVEL_LABEL: Record<CefrLevel, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper intermediate',
  C1: 'Advanced',
  C2: 'Proficient',
};

/**
 * E3 §12.2 CEFR level badge — a status label, not a progress meter (same
 * reasoning as `StreakFlame`: no min/max range exists to visualize). The
 * text alternative §12.5 requires is the spelled-out level name, since the
 * bare "B1" code isn't self-explanatory on its own.
 */
export function CefrBadge({ level, className }: CefrBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border border-primary-text px-2 py-0.5 type-caption font-semibold text-primary-text',
        className,
      )}
    >
      {level}
      <span className="sr-only"> — {LEVEL_LABEL[level]}</span>
    </span>
  );
}
