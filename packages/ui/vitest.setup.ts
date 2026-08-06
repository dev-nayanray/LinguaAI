import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import '@testing-library/jest-dom/vitest';

// RTL's own auto-cleanup only self-registers in vitest's "globals" mode
// (a global `afterEach`); this repo deliberately imports test functions
// explicitly everywhere (see every other package's vitest.config.ts), so
// cleanup is wired up here instead.
afterEach(cleanup);

// jsdom does not implement `window.matchMedia` — needed by useReducedMotion
// (src/hooks/use-reduced-motion.ts) and by any future component reading a
// media query directly. Defaults to `matches: false` (motion allowed);
// individual tests override `matches` per test to exercise the other
// state. A real `EventTarget` is used (not a bare object with no-op
// listener methods) so `addEventListener('change', ...)`/
// `removeEventListener` behave like the real API instead of silently
// doing nothing, which would make a test believe a change handler is wired
// up when it never fires.
window.matchMedia = vi.fn().mockImplementation((query: string) => {
  const target = new EventTarget();
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    // Deprecated but still used by some libraries' feature-detection.
    addListener: target.addEventListener.bind(target),
    removeListener: target.removeEventListener.bind(target),
  };
});

// jsdom implements none of these — needed by the Radix primitives added in
// E3 T3 (Select/DropdownMenu/Tooltip use pointer-capture and ResizeObserver
// internally; Select's viewport scrolling calls scrollIntoView). Real
// browsers provide all three; without stubs every interaction test using
// these primitives throws "not a function" before assertions even run.
Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
// @ts-expect-error -- jsdom has no ResizeObserver; this is a minimal test-only stub, not a full implementation.
window.ResizeObserver = ResizeObserverStub;
