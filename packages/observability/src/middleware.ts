import { context, propagation, SpanKind, trace } from '@opentelemetry/api';

const TRACER_NAME = '@linguaai/observability';

export interface CorrelationCarrier {
  /** Incoming request headers, if any — used to continue a trace propagated
   * from an upstream service (e.g. apps/api → speech-service → ai-engine,
   * ARCHITECTURE.md §6) via the standard W3C `traceparent` header. */
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Framework-agnostic core of the correlation-ID middleware (Part 7:
 * "correlationIdMiddleware (NestJS/Next.js)"). Extracts W3C trace context
 * from `carrier.headers` if present — continuing an existing trace rather
 * than starting an unrelated one — starts a span for this unit of work, and
 * runs `handler` within that span's context so `getCorrelationId()`
 * (correlation.ts) and the logger's `requestId` mixin (logger.ts) resolve
 * correctly for the duration of `handler`.
 *
 * `NodeTracerProvider.register()` (called by `initObservability`, init.ts)
 * registers the default W3C tracecontext+baggage propagator globally with
 * no extra setup here — verified against
 * @opentelemetry/sdk-trace-base's BasicTracerProvider.register()` — so
 * `propagation.extract` below works out of the box.
 *
 * A real NestJS interceptor or Next.js middleware is a thin per-framework
 * adapter around this function, added when those apps exist (T13/T14) —
 * this core is deliberately framework-agnostic and testable in isolation.
 */
export async function withCorrelation<T>(
  carrier: CorrelationCarrier,
  spanName: string,
  handler: () => Promise<T> | T,
): Promise<T> {
  const parentContext = propagation.extract(context.active(), carrier.headers ?? {});
  const tracer = trace.getTracer(TRACER_NAME);

  return tracer.startActiveSpan(
    spanName,
    { kind: SpanKind.SERVER },
    parentContext,
    async (span) => {
      try {
        return await handler();
      } finally {
        span.end();
      }
    },
  );
}
