import { defineConfig } from 'vitest/config';

export default defineConfig({
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
      // Storybook's own browser preview, never by vitest.
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.stories.tsx', 'src/index.ts', 'src/styles/**'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
