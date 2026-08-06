import type { ReactNode } from 'react';

import { cn } from '@ui/lib/cn';

import { AchievementCard } from '../cards/achievement-card';

export interface BadgeGridItem {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  unlocked?: boolean;
}

export interface BadgeGridProps {
  items: BadgeGridItem[];
  className?: string;
}

/**
 * E3 §12.2/§12.5 badge grid — "presentational, list semantics": a real
 * `<ul>`, not a bare CSS grid of `<div>`s (that's `DashboardGrid`'s job,
 * T9, for arbitrary non-list widget content). Composed from T7's
 * `AchievementCard`, not reimplemented.
 */
export function BadgeGrid({ items, className }: BadgeGridProps) {
  return (
    <ul className={cn('grid grid-cols-2 gap-4 tablet:grid-cols-3 desktop:grid-cols-4', className)}>
      {items.map((item) => (
        <li key={item.id}>
          <AchievementCard
            title={item.title}
            description={item.description}
            icon={item.icon}
            unlocked={item.unlocked}
          />
        </li>
      ))}
    </ul>
  );
}
