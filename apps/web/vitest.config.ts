import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // E3 T3 (§6b) — a distinct resolver from packages/ui's own
      // vitest.config.ts; this app's Vitest run needs its own copy since
      // it resolves packages/ui's transpiled source independently.
      '@ui': fileURLToPath(new URL('../../packages/ui/src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        // App Router conventions with no meaningful logic to unit-test at
        // skeleton stage — layout.tsx is pure composition, globals.css
        // isn't code.
        'src/app/layout.tsx',
        // T4's permanent dependency-boundary lint fixtures (ADR-015).
        'src/features/__boundary_fixture_*/**',
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
