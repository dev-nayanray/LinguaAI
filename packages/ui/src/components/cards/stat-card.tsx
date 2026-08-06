import * as React from 'react';

import { Minus, TrendingDown, TrendingUp } from '@ui/icons';
import { cn } from '@ui/lib/cn';

import { Skeleton } from '../ui/skeleton';
import { Card, CardContent, CardHeader } from './card';

export interface StatCardTrend {
  direction: 'up' | 'down' | 'neutral';
  /** Pre-formatted, e.g. "+12% this week" — this component does no number formatting of its own. */
  label: string;
}

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  trend?: StatCardTrend;
  icon?: React.ReactNode;
  loading?: boolean;
}

const TREND_ICON = { up: TrendingUp, down: TrendingDown, neutral: Minus } as const;
// "Up" isn't hardcoded to success and "down" to danger — a lower churn
// number or lower error rate is a good trend, so direction alone doesn't
// imply valence; both use the neutral text color, matching the case this
// component actually has evidence for (DESIGN_SYSTEM.md's "dashboard
// metrics" doesn't specify per-metric valence). A consumer that knows a
// specific metric's valence can still override via `className` on trend.
const TREND_COLOR = {
  up: 'text-neutral-text',
  down: 'text-neutral-text',
  neutral: 'text-neutral-text',
} as const;

/** E3 §12.2 dashboard-metrics card, composed from Card's own slots (§12.5). */
export function StatCard({
  label,
  value,
  trend,
  icon,
  loading = false,
  className,
  ...props
}: StatCardProps) {
  if (loading) {
    return (
      <Card className={className} {...props}>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-20" />
        </CardContent>
      </Card>
    );
  }

  const TrendIcon = trend ? TREND_ICON[trend.direction] : null;

  return (
    <Card className={className} {...props}>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <span className="type-body-sm text-neutral-text">{label}</span>
        {icon && <span className="text-neutral-text">{icon}</span>}
      </CardHeader>
      <CardContent>
        <p className="type-heading-lg text-text">{value}</p>
        {trend && TrendIcon && (
          <p
            className={cn(
              'mt-1 flex items-center gap-1 type-caption',
              TREND_COLOR[trend.direction],
            )}
          >
            <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
