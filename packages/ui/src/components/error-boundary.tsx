'use client';

import * as React from 'react';
import type { Logger } from '@linguaai/observability';

import { Button } from './button';

export interface ErrorBoundaryFallbackProps {
  error: Error;
  reset: () => void;
}

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * The app's shared @linguaai/observability logger (from
   * `initObservability()`), not created internally by this component — a
   * single logger instance carrying the correct `serviceName` is meant to
   * be reused across an app, not re-instantiated per error boundary. See
   * T10's report for the full reasoning (also verified pino resolves via
   * its "browser" package.json field, so bundling this for the client is
   * safe either way — the shared-instance argument is the deciding one).
   */
  logger: Logger;
  fallback?: (props: ErrorBoundaryFallbackProps) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Client-side error boundary implementing DESIGN_SYSTEM.md §5's "Error"
 * screen state: a specific, recoverable message with a retry path — never
 * a raw error code or stack trace surfaced to the user. The caught error
 * is reported through `logger` (structured, with the component stack)
 * instead of only landing in the browser console.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.props.logger.error(
      { err: error, componentStack: info.componentStack },
      'Unhandled error caught by ErrorBoundary',
    );
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): React.ReactNode {
    const { error } = this.state;

    if (error) {
      if (this.props.fallback) {
        return this.props.fallback({ error, reset: this.reset });
      }

      return (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950"
        >
          <p className="text-sm font-medium text-red-900 dark:text-red-100">
            Something went wrong loading this section. Try again, or refresh the page if the problem
            continues.
          </p>
          <Button variant="secondary" onClick={this.reset}>
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
