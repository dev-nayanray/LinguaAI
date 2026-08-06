import * as React from 'react';

import { cn } from '@ui/lib/cn';

import { Skeleton } from '../ui/skeleton';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

export type LessonStatus = 'not-started' | 'in-progress' | 'completed';

const STATUS_LABEL: Record<LessonStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
};

// Border + text only (§2.1's `--radius-pill` is documented for exactly this
// badge/tag use) — no tinted-background token exists in the approved set
// (same constraint FormError/FormSuccess/ErrorBoundary already work
// within), so none is invented here either.
const STATUS_CLASS: Record<LessonStatus, string> = {
  'not-started': 'border-border text-neutral-text',
  'in-progress': 'border-primary-text text-primary-text',
  completed: 'border-success-text text-success-text',
};

export interface LessonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  status: LessonStatus;
  /** Typically a Button — LessonCard supplies no click/keyboard interaction model of its own (presentational only, ADR-006); the action is the consumer's. */
  footer?: React.ReactNode;
  loading?: boolean;
}

/** E3 §12.2, composed from Card's own slots (§12.5). */
export function LessonCard({
  title,
  description,
  status,
  footer,
  loading = false,
  className,
  ...props
}: LessonCardProps) {
  if (loading) {
    return (
      <Card className={className} {...props}>
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-16 rounded-pill" />
          <Skeleton className="mt-1 h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className} {...props}>
      <CardHeader className="pb-3">
        <span
          className={cn(
            'inline-flex w-fit items-center gap-1.5 rounded-pill border px-2 py-0.5 type-caption',
            STATUS_CLASS[status],
          )}
        >
          {STATUS_LABEL[status]}
        </span>
        <CardTitle className="mt-1">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}
