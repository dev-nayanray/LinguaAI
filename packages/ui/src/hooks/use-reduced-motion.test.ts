import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useReducedMotion } from './use-reduced-motion';

/** Builds a fake MediaQueryList backed by a real EventTarget, so
 * dispatching a 'change' event actually invokes registered listeners —
 * matching the shape of the real browser API this hook depends on. */
function fakeMediaQueryList(initialMatches: boolean) {
  const target = new EventTarget();
  const list = {
    matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    addListener: target.addEventListener.bind(target),
    removeListener: target.removeEventListener.bind(target),
  };
  return list;
}

describe('useReducedMotion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when the media query does not match (motion allowed)', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(
      fakeMediaQueryList(false) as unknown as MediaQueryList,
    );

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('returns true when the media query matches (reduced motion requested)', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(
      fakeMediaQueryList(true) as unknown as MediaQueryList,
    );

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
  });

  it('updates when the media query change event fires', () => {
    const list = fakeMediaQueryList(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(list as unknown as MediaQueryList);

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      list.matches = true;
      list.dispatchEvent(new Event('change'));
    });

    expect(result.current).toBe(true);
  });

  it('removes its change listener on unmount', () => {
    const list = fakeMediaQueryList(false);
    const removeSpy = vi.spyOn(list, 'removeEventListener');
    vi.spyOn(window, 'matchMedia').mockReturnValue(list as unknown as MediaQueryList);

    const { unmount } = renderHook(() => useReducedMotion());
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
