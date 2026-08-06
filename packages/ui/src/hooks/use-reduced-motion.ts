import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Mirrors the `prefers-reduced-motion` media query as component state, so
 * components can additionally branch in JS (e.g. skipping a
 * celebratory-only animation entirely) beyond what the CSS-level
 * `@media (prefers-reduced-motion: reduce)` override in tokens.css already
 * handles for duration-based transitions.
 */
export function useReducedMotion(): boolean {
  // Defaults to false (motion allowed) until the effect below runs — never
  // reads `window` during render, so this is safe under SSR (apps/web and
  // apps/admin render this package's components server-side via Next.js).
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(QUERY);
    const handleChange = () => setReduced(mediaQueryList.matches);

    handleChange();
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, []);

  return reduced;
}
