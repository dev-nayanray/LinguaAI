'use client';

import type { ReactNode } from 'react';
import { createLogger } from '@linguaai/observability/client';
import { ErrorBoundary } from '@linguaai/ui';

// Imports from the /client subpath, not the package root — the root
// barrel also reaches initObservability() (Node-only OTel tracing SDK,
// @opentelemetry/sdk-trace-node), and importing createLogger through that
// barrel still pulled sdk-trace-node's `async_hooks` requirement into this
// client bundle even though initObservability itself went unused
// (verified against a real `next build` — Turbopack did not tree-shake it
// away, the build failed outright). /client is a structurally separate
// entry point that can never reach that code path. Created once at module
// scope, not per-render — this file only ever runs on the client
// (`'use client'`).
const logger = createLogger({ serviceName: 'web' });

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary logger={logger}>{children}</ErrorBoundary>;
}
