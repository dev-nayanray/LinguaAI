import * as React from 'react';

import { cn } from '@ui/lib/cn';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Alt text is required, not optional — an avatar always identifies someone/something, so it's never decorative. */
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASS: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-8 w-8 type-caption',
  md: 'h-10 w-10 type-body-sm',
  lg: 'h-12 w-12 type-body-md',
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * Hand-rolled, not a dependency — image when `src` is given, otherwise
 * initials derived from `name`. Named directly by the Agent persona header
 * contract (E3 §12.5: "Static, `Avatar` hand-rolled") but generic enough
 * for any future category that needs one.
 */
export function Avatar({ name, src, size = 'md', className, ...props }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted font-medium text-neutral-text',
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    >
      {src ? (
        // No <Image> equivalent in a presentational-only, framework-agnostic
        // package (E3 §6) — a plain <img> is correct here, not a Next.js dependency.
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
      {!src && <span className="sr-only">{name}</span>}
    </span>
  );
}
