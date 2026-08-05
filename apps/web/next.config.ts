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
};

export default nextConfig;
