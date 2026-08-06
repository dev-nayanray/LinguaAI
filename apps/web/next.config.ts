import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // packages/ui (and packages/observability, imported by its client-side
  // ErrorBoundary usage) ship as raw TS/TSX source, not pre-built dist/ —
  // transpilePackages tells Next to run its own compiler over them
  // directly, so editing a packages/ui component hot-reloads here with no
  // separate build step in between (E1 Part 5, T14 acceptance criteria).
  transpilePackages: ['@linguaai/ui', '@linguaai/observability', '@linguaai/auth-client'],
  // Minimal, self-contained production server (infrastructure/docker/web,
  // T17) — traces only the actually-used dependency subset instead of
  // shipping the full node_modules tree in the runtime image.
  output: 'standalone',
  // `@ui/*` (E3 T3, §6b) — packages/ui's own source (transpiled directly
  // into this app's build via transpilePackages above) uses this alias
  // internally for its Shadcn-generated primitives. The tsconfig.json
  // `paths` entry satisfies the type-checker; the bundler resolves module
  // specifiers independently and needs the same alias registered here.
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
