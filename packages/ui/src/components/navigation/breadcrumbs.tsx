import * as React from 'react';

import { cn } from '@ui/lib/cn';

export interface BreadcrumbItem {
  label: string;
  /** Omitted (or simply the last array entry) for the current page — rendered as text, not a link, matching standard breadcrumb semantics. */
  href?: string;
}

export interface BreadcrumbsProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
}

/** E3 §12.2/§12.5: semantic nav landmark; the last item is always "current" — `aria-current="page"`, not a link, regardless of whether it has an `href`. */
export function Breadcrumbs({ items, className, ...props }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={className} {...props}>
      <ol className="flex items-center gap-2 type-body-sm text-neutral-text">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {index > 0 && (
                <span aria-hidden="true" className="text-neutral-text">
                  /
                </span>
              )}
              {isCurrent || !item.href ? (
                <span
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(isCurrent && 'font-semibold text-text')}
                >
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  className={cn(
                    'rounded-sm transition-colors duration-micro hover:text-text',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
                  )}
                >
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
