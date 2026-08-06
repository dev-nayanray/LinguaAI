import * as React from 'react';

import { cn } from '@ui/lib/cn';

import type { NavItem } from './nav-item';

export interface TopNavProps extends React.HTMLAttributes<HTMLElement> {
  items: NavItem[];
  activeHref: string;
  brand?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * E3 §12.2/§12.5: "Semantic nav landmarks", active-item indication that is
 * not color-only — `aria-current="page"` (the real, non-visual signal)
 * paired with a font-weight change, not a color change alone.
 */
export function TopNav({ items, activeHref, brand, actions, className, ...props }: TopNavProps) {
  return (
    <header className={cn('border-b border-border bg-surface', className)} {...props}>
      <div className="flex h-16 items-center justify-between gap-4 px-4">
        {brand && <div className="flex items-center">{brand}</div>}
        <nav aria-label="Main" className="flex flex-1 items-center gap-1">
          {items.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 type-body-sm transition-colors duration-micro',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'font-semibold text-primary-text'
                    : 'text-neutral-text hover:text-text',
                )}
              >
                {item.icon}
                {item.label}
              </a>
            );
          })}
        </nav>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
