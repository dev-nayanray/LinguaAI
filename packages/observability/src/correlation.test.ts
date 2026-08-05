import { context, INVALID_SPAN_CONTEXT, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getCorrelationId } from './correlation.js';

describe('getCorrelationId', () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    provider.register();
  });

  afterEach(async () => {
    trace.disable();
    await provider.shutdown();
  });

  it('returns undefined when there is no active span', () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it("returns the active span's trace ID as a 32-character lowercase hex string", () => {
    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('test-span', (span) => {
      const correlationId = getCorrelationId();

      expect(correlationId).toBe(span.spanContext().traceId);
      expect(correlationId).toMatch(/^[0-9a-f]{32}$/);
      span.end();
    });
  });

  it('returns undefined again once the span has ended and context is no longer active', () => {
    const tracer = trace.getTracer('test');
    tracer.startActiveSpan('test-span', (span) => {
      span.end();
    });

    expect(getCorrelationId()).toBeUndefined();
  });

  it('returns undefined when the active span has an invalid span context (defensive branch)', () => {
    const invalidSpan = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
    const ctx = trace.setSpan(context.active(), invalidSpan);

    context.with(ctx, () => {
      expect(getCorrelationId()).toBeUndefined();
    });
  });
});
