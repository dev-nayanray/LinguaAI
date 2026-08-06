import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ' +
    'transition-colors duration-micro ease-entrance focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      // Re-themed onto E3's semantic token layer (E3 design document §12.1
      // "Brand tokens vs. Action tokens"). `primary`/`destructive` use the
      // validated `-solid` fill tokens (not the raw `--color-primary`/
      // `--color-danger` anchors directly — a raw anchor is documented as
      // decorative-only and must never be used as a white-text fill).
      // `secondary`/`ghost` are action-role treatments with no brand color
      // of their own, built from the already-validated neutral surface/
      // border/text tokens — no separate `dark:` classes are needed for any
      // variant, since every token referenced here already resolves its own
      // light/dark value via `[data-theme="dark"]` (tokens.css).
      variant: {
        primary: 'bg-primary-solid text-white hover:bg-primary-solid/90',
        secondary: 'border border-border bg-surface-muted text-text hover:bg-surface-muted/80',
        ghost: 'text-text hover:bg-surface-muted',
        destructive: 'bg-danger-solid text-white hover:bg-danger-solid/90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Renders as the single child element instead of a <button> (Radix Slot) — for e.g. wrapping a Next <Link>. */
  asChild?: boolean;
  /** Shows an inline spinner and forces the disabled state, per DESIGN_SYSTEM.md §4: "loading and disabled states built in, not bolted on per usage." */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled ?? loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          // Radix Slot requires exactly one element child to clone props
          // onto — the loading-spinner decoration below only applies to
          // the plain <button> case, not the asChild passthrough case.
          children
        ) : (
          <>
            {loading && (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
                />
              </svg>
            )}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
