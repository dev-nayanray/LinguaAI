import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Same rationale as packages/types' vitest.config.ts: only identity/
      // carries real E2 content today.
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/learning/**',
        'src/ai-coaching/**',
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
