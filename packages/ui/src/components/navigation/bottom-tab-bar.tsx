import * as React from 'react';

import { cn } from '@ui/lib/cn';

import type { NavItem } from './nav-item';

export interface BottomTabBarProps extends React.HTMLAttributes<HTMLElement> {
  items: NavItem[];
  activeHref: string;
}

/**
 * E3 §12.2 — mobile/responsive bottom tab bar. §12.5 flags the
 * sidebar↔tab-bar responsive swap as **requiring mandatory manual
 * screen-reader verification** (one of the eight named high-risk
 * components) — that pass is human-performed and has not been done; this
 * implementation is built and automatedly tested to spec, but the
 * Accessibility Quality Gate (§21) for this component is not yet closed.
 * See Sidebar's own doc comment for how the two compose via breakpoint
 * visibility classes.
 */
export function BottomTabBar({ items, activeHref, className, ...props }: BottomTabBarProps) {
  return (
    <nav
      aria-label="Bottom navigation"
      className={cn('fixed inset-x-0 bottom-0 flex border-t border-border bg-surface', className)}
      {...props}
    >
      {items.map((item) => {
        const isActive = item.href === activeHref;
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2 type-caption transition-colors duration-micro',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
              isActive ? 'font-semibold text-primary-text' : 'text-neutral-text',
            )}
          >
            {item.icon}
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
