'use client';

import * as React from 'react';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

/**
 * Sonner ships its own light/dark class toggle keyed off a `theme` prop
 * (typically driven by `next-themes`), but this package's dark mode is the
 * `data-theme="dark"` attribute (tokens.css), not a `next-themes` class —
 * and `next-themes` isn't part of this stack (ARCHITECTURE.md). Styling via
 * `toastOptions.classNames` with our own token-bound Tailwind classes
 * sidesteps both: those classes already re-resolve under `[data-theme]`
 * with no separate theme prop needed.
 */
function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-surface-elevated group-[.toaster]:text-text ' +
            'group-[.toaster]:border-border group-[.toaster]:shadow-high',
          description: 'group-[.toast]:text-neutral-text',
          actionButton: 'group-[.toast]:bg-primary-solid group-[.toast]:text-white',
          cancelButton: 'group-[.toast]:bg-surface-muted group-[.toast]:text-neutral-text',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
