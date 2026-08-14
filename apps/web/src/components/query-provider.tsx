'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * One `QueryClient` per browser session, created inside `useState`'s
 * lazy initializer so it survives re-renders but never leaks across
 * requests on the server (Next.js's own documented pattern for React
 * Query in the App Router — a module-level singleton would be shared
 * across concurrent server-rendered requests).
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
