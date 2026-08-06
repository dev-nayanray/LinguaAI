import * as React from 'react';

import { cn } from '@ui/lib/cn';

import type { NavItem } from './nav-item';

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  items: NavItem[];
  activeHref: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * E3 §12.2 — desktop sidebar. §12.5: "Responsive swap with sidebar at the
 * tablet breakpoint" (paired with BottomTabBar) — this component has no
 * opinion on when it's shown; the consumer toggles visibility with the
 * breakpoint utilities both components are already authored against
 * (§12.3's mobile-first convention), e.g. `className="hidden tablet:flex"`
 * here and `className="flex tablet:hidden"` on BottomTabBar.
 */
export function Sidebar({ items, activeHref, header, footer, className, ...props }: SidebarProps) {
  return (
    <nav
      aria-label="Sidebar"
      className={cn('flex w-60 flex-col border-r border-border bg-surface', className)}
      {...props}
    >
      {header && <div className="border-b border-border p-4">{header}</div>}
      <ul className="flex flex-1 flex-col gap-1 p-2">
        {items.map((item) => {
          const isActive = item.href === activeHref;
          return (
            <li key={item.href}>
              <a
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 type-body-sm transition-colors duration-micro',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'font-semibold text-primary-text bg-surface-muted'
                    : 'text-neutral-text hover:bg-surface-muted hover:text-text',
                )}
              >
                {item.icon}
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
      {footer && <div className="border-t border-border p-4">{footer}</div>}
    </nav>
  );
}
