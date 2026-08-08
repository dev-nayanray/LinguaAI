import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // index.ts (root barrel) and every subpath carrying only hand-written
      // wire-type interfaces + const enum arrays (no branching logic to
      // meaningfully exercise) are excluded from this threshold — their
      // real correctness is verified where they're actually consumed
      // (e.g. apps/api's own Jest suites exercising the Zod schemas built
      // from these types). commerce/community/enterprise remain genuinely
      // empty placeholders (later epics); learning/ai-coaching/content/
      // vocabulary have real content (E6/E8/E9) but the same "no logic
      // here" shape.
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/learning/**',
        'src/ai-coaching/**',
        'src/content/**',
        'src/vocabulary/**',
        'src/commerce/**',
        'src/community/**',
        'src/enterprise/**',
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
