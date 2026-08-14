import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import '@testing-library/jest-dom/vitest';

afterEach(cleanup);

// jsdom implements no `matchMedia` at all — `ThemeProvider`'s
// `prefers-color-scheme` fallback needs one to exist to avoid throwing in
// every test that mounts it (directly or via the (app) shell/layout).
// Defaults to "no preference matched" (light), overridable per test via
// `vi.stubGlobal('matchMedia', ...)`.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
