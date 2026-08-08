import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Same rationale as packages/types' vitest.config.ts: schema/type-only
      // subpaths with no branching logic are excluded — their real
      // correctness is verified where they're actually consumed (apps/api's
      // own Jest suites exercising these Zod schemas via ZodValidationPipe).
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
