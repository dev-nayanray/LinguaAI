'use client';

import type { ReactNode } from 'react';
import { createLogger } from '@linguaai/observability/client';
import { ErrorBoundary } from '@linguaai/ui';

// See apps/web/src/components/client-error-boundary.tsx for the full
// rationale on why this imports from the /client subpath specifically.
const logger = createLogger({ serviceName: 'admin' });

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary logger={logger}>{children}</ErrorBoundary>;
}
