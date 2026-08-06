import type { HTMLAttributes } from 'react';

import { cn } from '@ui/lib/cn';

/**
 * A CLS-safe loading placeholder: callers size it via `className` to match
 * the exact dimensions of the content it stands in for (E3 §15's rule that
 * a loading state must render at the same dimensions as its loaded
 * equivalent), not a generic one-size skeleton.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-muted', className)}
      {...props}
    />
  );
}
