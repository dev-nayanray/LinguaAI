import * as React from 'react';

import { Check } from '@ui/icons';
import { cn } from '@ui/lib/cn';

import { Button } from '../button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

export interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Plan value proposition as a checked feature list — a typed slot rather than arbitrary `children`, matching this document's "structured props, never raw HTML" precedent (inline correction/diff UI, §12.4). */
  features?: string[];
  price?: string;
  ctaLabel?: string;
  /** Left un-awaited by this component — the caller owns the upgrade request and controls `loading`/`error`/`open` in response to its own result. */
  onUpgrade: () => void;
  dismissLabel?: string;
  /** True while the caller's upgrade request is in flight. The dialog stays open and the CTA shows a busy state — closing/dismissing is the caller's decision once the request settles, not automatic on click. */
  loading?: boolean;
  /** A failed-upgrade message, e.g. "Payment declined." Rendered in place, not toasted, since the user is still looking at the modal that triggered it. */
  error?: string;
  className?: string;
}

/**
 * E3 §12.4/§12.5 paywall/upgrade modal — `AlertDialog`, focus-trap +
 * restoration. One of the eight components requiring mandatory manual
 * screen-reader verification (§12.5); that pass has not been performed —
 * see the T13 report.
 *
 * The upgrade CTA is a plain themed `Button`, not `AlertDialogAction`:
 * Radix's `Action` auto-closes the dialog on click, which would race the
 * `loading`/`error` states above (the dialog must stay open while a
 * request is in flight or has failed). `AlertDialogCancel` is used as-is
 * for the dismiss action, since "not now" has no async consequence.
 *
 * Focus restoration is handled explicitly via `onCloseAutoFocus` rather
 * than left to Radix's default: this component is opened via a controlled
 * `open` prop, not an internal `AlertDialogTrigger`, and Radix's own
 * `Content` renders behind the caller's own trigger of choice (a banner, a
 * locked-lesson tap target, anywhere in the host app) — there is no single
 * fixed trigger element Radix can assume. Instead, whatever element had
 * focus immediately before `open` became `true` is captured and refocused
 * once the exit transition completes (`onCloseAutoFocus` fires after
 * Radix's `Presence` finishes unmounting, matching `scaleTransition`'s
 * animated exit) — verified against a real browser via the Storybook
 * interaction test below, not assumed from Radix's documented default.
 */
export function PaywallModal({
  open,
  onOpenChange,
  title,
  description,
  features,
  price,
  ctaLabel = 'Upgrade',
  onUpgrade,
  dismissLabel = 'Not now',
  loading = false,
  error,
  className,
}: PaywallModalProps) {
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open) previouslyFocused.current = document.activeElement as HTMLElement | null;
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={cn('max-w-md', className)}
        onCloseAutoFocus={(event) => {
          if (previouslyFocused.current) {
            event.preventDefault();
            previouslyFocused.current.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {features && features.length > 0 && (
          <ul className="flex flex-col gap-2">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 type-body-sm text-text">
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success-text" />
                {feature}
              </li>
            ))}
          </ul>
        )}

        {price && <p className="type-heading-sm text-text">{price}</p>}

        {error && (
          <p role="alert" className="type-caption text-danger-text">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{dismissLabel}</AlertDialogCancel>
          <Button type="button" variant="primary" loading={loading} onClick={onUpgrade}>
            {ctaLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
