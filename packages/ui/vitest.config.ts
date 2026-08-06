import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // E3 T3 (§6b) — a distinct prefix from apps/web's and apps/admin's
      // own `@/*` (which each map to their own `./src`), so packages/ui's
      // own `@ui/*`-prefixed imports (its Shadcn-generated primitives)
      // resolve correctly no matter which app's build is currently
      // transpiling this package's source.
      '@ui': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // index.ts is a pure re-export barrel; tokens.css has no logic to
      // cover — same rationale as every other package's barrel exclusion.
      // *.stories.tsx is Storybook-only presentational content, executed by
      // Storybook's own browser preview, never by vitest. The nine
      // components/<category>/index.ts placeholders (E3 T2, §6d) are the
      // same kind of barrel — each is a single `export {};` with no logic,
      // populated with real exports (and real coverage) starting at that
      // category's own owning task.
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.stories.tsx',
        'src/index.ts',
        'src/styles/**',
        'src/components/*/index.ts',
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
