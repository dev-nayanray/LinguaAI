import { cn } from '@ui/lib/cn';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../cards/card';
import { ProgressBar } from '../progress/progress-bar';

export interface MissionCardProps {
  title: string;
  description?: string;
  current: number;
  target: number;
  /** e.g. "+50 XP" — pre-formatted, this component does no reward-value formatting of its own. */
  reward?: string;
  className?: string;
}

/**
 * E3 §12.2 mission/challenge card — composed from `Card` (T7) and
 * `ProgressBar` (T11), not reimplemented.
 */
export function MissionCard({
  title,
  description,
  current,
  target,
  reward,
  className,
}: MissionCardProps) {
  const completed = current >= target;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ProgressBar value={current} max={target} label={`${title} progress`} showValueText />
        <div className="flex items-center justify-between type-caption">
          {reward && <span className="text-neutral-text">Reward: {reward}</span>}
          {completed && (
            <span className={cn('font-semibold text-success-text', !reward && 'ml-auto')}>
              Completed
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
