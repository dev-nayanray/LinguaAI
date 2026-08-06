import * as React from 'react';

import { cn } from '@ui/lib/cn';

import { Skeleton } from '../ui/skeleton';
import { Card, CardDescription, CardHeader, CardTitle } from './card';

export interface AchievementCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  /** A badge glyph/image — this component has no opinion on icon vs. illustration. */
  icon?: React.ReactNode;
  /** Defaults `true` — most achievement grids show unlocked items far more often than locked ones. */
  unlocked?: boolean;
  loading?: boolean;
}

/**
 * E3 §12.2, composed from Card's own slots (§12.5). Locked state is
 * signaled by the "Locked" text badge, not by dimming — matching §12.5's
 * recurring "not color/appearance-only" principle (stated explicitly for
 * nav's active-item indication) applied here to the equivalent case.
 * (An earlier version dimmed the whole card via `opacity-60`; the
 * Storybook a11y check caught that this dragged `text-neutral-text` —
 * already at the token's own validated 4.5:1 floor at full opacity — down
 * to 2.87:1. Only the decorative icon is dimmed now; title/description/
 * badge stay at full contrast.)
 */
export function AchievementCard({
  title,
  description,
  icon,
  unlocked = true,
  loading = false,
  className,
  ...props
}: AchievementCardProps) {
  if (loading) {
    return (
      <Card className={className} {...props}>
        <CardHeader className="items-center text-center">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="mt-2 h-5 w-24" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className} {...props}>
      <CardHeader className="items-center text-center">
        {icon && <div className={cn('text-neutral-text', !unlocked && 'opacity-60')}>{icon}</div>}
        <CardTitle className="mt-2">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {!unlocked && (
          <span className="mt-1 rounded-pill border border-border px-2 py-0.5 type-caption text-neutral-text">
            Locked
          </span>
        )}
      </CardHeader>
    </Card>
  );
}
