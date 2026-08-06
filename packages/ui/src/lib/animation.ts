/**
 * Shared open/close transition classes for Radix primitives (E3 T3).
 *
 * The E3 design document's motion tokens (`--duration-*`, `--ease-*`,
 * tokens.css) don't include a state-based enter/exit animation utility, and
 * no animation plugin (e.g. `tailwindcss-animate`) is installed or
 * ADR-approved anywhere in this repo (verified — zero other references).
 * Rather than adding an unapproved dependency, every overlay/popper
 * primitive here drives a plain CSS transition off Radix's own
 * `data-state="open"|"closed"` attribute using only tokens that already
 * exist. Radix's Presence keeps the element mounted for the transition's
 * duration before unmounting on close, so this works without a plugin.
 */

export const overlayTransition =
  'transition-opacity duration-standard data-[state=closed]:ease-exit ' +
  'data-[state=open]:ease-entrance data-[state=closed]:opacity-0 data-[state=open]:opacity-100';

export const scaleTransition =
  'transition-[opacity,transform] duration-standard data-[state=closed]:ease-exit ' +
  'data-[state=open]:ease-entrance data-[state=closed]:opacity-0 data-[state=open]:opacity-100 ' +
  'data-[state=closed]:scale-95 data-[state=open]:scale-100';
