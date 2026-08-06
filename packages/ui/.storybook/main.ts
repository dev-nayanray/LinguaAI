import { dirname } from 'path';
import { fileURLToPath } from 'url';

import tailwindcss from '@tailwindcss/vite';
import type { StorybookConfig } from '@storybook/react-vite';

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */
function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    getAbsolutePath('@storybook/addon-a11y'),
    getAbsolutePath('@storybook/addon-docs'),
    getAbsolutePath('@storybook/addon-mcp'),
  ],
  framework: getAbsolutePath('@storybook/react-vite'),
  // Tailwind v4 is CSS-first (no tailwind.config.js) — its Vite plugin is
  // what actually processes `@import "tailwindcss"`/`@theme` in tokens.css.
  // packages/ui has no standalone vite.config.ts of its own (it's a
  // component library, not a Vite app), so the plugin is registered here.
  // The `@ui` alias (E3 T3, §6b) is registered the same way, for the same
  // reason vitest.config.ts needs its own copy — Storybook's Vite build is
  // an independent resolver from both the TS compiler and Vitest.
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import('vite');
    const { fileURLToPath } = await import('node:url');
    return mergeConfig(viteConfig, {
      plugins: [tailwindcss()],
      resolve: {
        alias: {
          '@ui': fileURLToPath(new URL('../src', import.meta.url)),
        },
      },
    });
  },
};

export default config;
