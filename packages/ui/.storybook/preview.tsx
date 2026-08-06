import React, { useEffect } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';

import '../src/styles/tokens.css';

// Theme-switcher (E3 design document §12.1/§18 T1 deliverable): toggles the
// same `data-theme` attribute tokens.css's `@custom-variant dark` and
// `[data-theme="dark"]` raw-value overrides key off, so every token in the
// library — and every component built on top of it — re-resolves correctly
// when a reviewer switches themes from Storybook's own toolbar, independent
// of the OS-level `prefers-color-scheme` setting.
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return <Story />;
};

const preview: Preview = {
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Light/dark theme (E3 data-theme mechanism)',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
  },
  decorators: [withTheme],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // E3 T15 — `@storybook/addon-a11y`'s Storybook-9+ mechanism: setting
    // `test: 'error'` here is what makes `@storybook/test-runner` fail a
    // story on an axe violation (via the addon's own `afterEach` hook,
    // composed into every story's annotations), not a separate
    // `.storybook/test-runner.ts` + `axe-playwright` setup — that recipe
    // is `@storybook/test-runner`'s own README-documented Storybook-8
    // fallback, superseded for this repo's Storybook 10 install.
    a11y: {
      test: 'error',
    },
  },
};

export default preview;
