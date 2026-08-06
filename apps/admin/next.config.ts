import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // See apps/web/next.config.ts for the full rationale — same wiring,
  // separate deploy target (T15: "distinct ECS service from web").
  transpilePackages: ['@linguaai/ui', '@linguaai/observability', '@linguaai/auth-client'],
  // Minimal, self-contained production server (infrastructure/docker/admin,
  // T17) — see apps/web/next.config.ts for the same rationale.
  output: 'standalone',
  // `@ui/*` (E3 T3, §6b) — see apps/web/next.config.ts for the full
  // rationale; same wiring, mirrored for this app.
  turbopack: {
    resolveAlias: {
      '@ui/*': '../../packages/ui/src/*',
    },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@ui': path.resolve(__dirname, '../../packages/ui/src'),
    };
    return config;
  },
};

export default nextConfig;
