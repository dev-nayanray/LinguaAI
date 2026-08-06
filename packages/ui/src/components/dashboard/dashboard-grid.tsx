import * as React from 'react';

import { cn } from '@ui/lib/cn';

import { Widget } from './widget';

export interface DashboardGridColumns {
  mobile: number;
  tablet: number;
  desktop: number;
}

export interface DashboardGridProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  children: React.ReactNode;
  columns?: DashboardGridColumns;
  gap?: 'sm' | 'md' | 'lg';
}

const DEFAULT_COLUMNS: DashboardGridColumns = { mobile: 1, tablet: 2, desktop: 3 };

const GAP_CLASS: Record<NonNullable<DashboardGridProps['gap']>, string> = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
};

/**
 * E3 §12.4's Dashboard grid/widget primitive — a single shared layout,
 * composed differently per context (learner/admin/enterprise dashboards),
 * not rebuilt per context (DESIGN_SYSTEM.md §4).
 *
 * `columns` is a runtime prop, so its values can't become part of a
 * Tailwind class name (`grid-cols-${n}` isn't statically analyzable by
 * Tailwind's scanner — a well-known JIT limitation). Instead each
 * breakpoint's column count is written to a CSS custom property via
 * `style`, and a *static* arbitrary-value class
 * (`grid-cols-[repeat(var(--dg-cols-mobile),minmax(0,1fr))]`) references
 * it — the class string itself never changes, only the variable's value
 * does, so Tailwind can see and generate it at build time.
 */
export function DashboardGrid({
  children,
  columns = DEFAULT_COLUMNS,
  gap = 'md',
  className,
  style,
  ...props
}: DashboardGridProps) {
  // E3 §12.4's Dashboard grid/widget contract explicitly specifies this
  // exact check ("process.env.NODE_ENV !== 'production'",
  // "dead-code-eliminated in production"). eslint.config.js's
  // `no-restricted-globals` ban on `process` (E3 §13) targets real
  // network/environment-config reads — the design doc's own conflicting
  // requirement here doesn't fall into that class: `NODE_ENV` is a
  // build-time-replaced constant every major bundler (webpack, Vite,
  // esbuild) statically substitutes and strips in production, not a
  // runtime environment read. No viable substitute exists —
  // `import.meta.env.DEV` is Vite-only and breaks when this component is
  // compiled into apps/web/apps/admin's Next.js build.
  // eslint-disable-next-line no-restricted-globals
  if (process.env.NODE_ENV !== 'production') {
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type !== Widget && child.type !== React.Fragment) {
        const name =
          typeof child.type === 'string'
            ? child.type
            : ((child.type as { displayName?: string; name?: string }).displayName ??
              (child.type as { name?: string }).name ??
              'unknown');
        console.warn(
          `DashboardGrid: expected a Widget (or React.Fragment) as a direct child, got <${name}>. ` +
            'Wrap non-Widget content in <Widget> before placing it in a DashboardGrid.',
        );
      }
    });
  }

  return (
    <div
      style={
        {
          '--dg-cols-mobile': columns.mobile,
          '--dg-cols-tablet': columns.tablet,
          '--dg-cols-desktop': columns.desktop,
          ...style,
        } as React.CSSProperties
      }
      className={cn(
        'grid grid-cols-[repeat(var(--dg-cols-mobile),minmax(0,1fr))]',
        'tablet:grid-cols-[repeat(var(--dg-cols-tablet),minmax(0,1fr))]',
        'desktop:grid-cols-[repeat(var(--dg-cols-desktop),minmax(0,1fr))]',
        GAP_CLASS[gap],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
