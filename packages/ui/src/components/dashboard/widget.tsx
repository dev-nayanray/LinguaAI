import * as React from 'react';

import { cn } from '@ui/lib/cn';

export type WidgetProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * E3 §12.4's Dashboard grid/widget primitive — the only element
 * `DashboardGrid` accepts as a direct child (its own dev-mode composition
 * check identifies a child by this exact component reference). Widget
 * itself carries no visual opinion — a stat card, chart, or anything else
 * goes inside it unstyled; "composed differently per context" per
 * DESIGN_SYSTEM.md §4. `min-w-0` prevents its content from forcing the
 * CSS grid track wider than the column (the standard grid-item overflow
 * fix — a `fr` track's implicit `min-width: auto` otherwise lets a wide
 * child, e.g. unbroken text, blow out the layout).
 */
export const Widget = React.forwardRef<HTMLDivElement, WidgetProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('min-w-0', className)} {...props} />
  ),
);
Widget.displayName = 'Widget';
