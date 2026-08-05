import pino from 'pino';

import { getCorrelationId } from './correlation.js';

export type Logger = pino.Logger;

export interface CreateLoggerOptions {
  serviceName: string;
  level?: 'error' | 'warn' | 'info' | 'debug';
  /** Defaults to stdout. Overridden by tests to capture output for assertions. */
  destination?: NodeJS.WritableStream;
}

/**
 * Structured JSON logger (OBSERVABILITY.md §1): every log line carries
 * `timestamp`, `level` (string label, not pino's default numeric value),
 * `service`, and `message` (renamed from pino's default `msg` key).
 * `requestId` is injected automatically via `mixin` whenever a call happens
 * inside an active trace — the SAME value as the OTel trace ID
 * (correlation.ts, ADR-016), never a second, independently-generated ID.
 *
 * `userId`/`tenantId` are deliberately NOT auto-injected here — this package
 * has no notion of authentication or tenancy. A caller that knows those
 * values attaches them per-request via pino's native `logger.child({...})`.
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const instance = pino(
    {
      level: options.level ?? 'info',
      base: { service: options.serviceName },
      messageKey: 'message',
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      mixin() {
        const requestId = getCorrelationId();
        return requestId ? { requestId } : {};
      },
    },
    options.destination,
  );

  return instance;
}
