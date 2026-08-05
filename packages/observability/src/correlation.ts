import { isSpanContextValid, trace } from '@opentelemetry/api';

/**
 * The platform-wide correlation ID: the active OpenTelemetry span's trace ID,
 * formatted as a lowercase hex string. This is deliberately the SAME
 * identifier used in structured logs (via the logger's `mixin`, logger.ts)
 * and the API error envelope's `requestId` field (API_GUIDELINES.md §3) —
 * ADR-016 — never a separately-generated UUID kept in sync by hand.
 *
 * Returns `undefined` outside any traced request context (e.g. at module
 * load time, or in code paths that never open a span).
 */
export function getCorrelationId(): string | undefined {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) {
    return undefined;
  }

  const spanContext = activeSpan.spanContext();
  return isSpanContextValid(spanContext) ? spanContext.traceId : undefined;
}
