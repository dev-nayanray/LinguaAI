import { trace } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getCorrelationId } from './correlation.js';
import { withCorrelation } from './middleware.js';

describe('withCorrelation', () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    // .register() with no args sets up the default W3C tracecontext+baggage
    // propagator globally — verified against BasicTracerProvider's compiled
    // output — required for the incoming-traceparent test below to work.
    provider.register();
  });

  afterEach(async () => {
    trace.disable();
    await provider.shutdown();
  });

  it('runs the handler with a correlation ID available for its duration', async () => {
    let observedId: string | undefined;

    const result = await withCorrelation({}, 'test-request', () => {
      observedId = getCorrelationId();
      return 'handler-result';
    });

    expect(result).toBe('handler-result');
    expect(observedId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('exports exactly one span named after the request, ended after the handler returns', async () => {
    await withCorrelation({}, 'my-span-name', () => 'done');

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const [span] = spans;
    expect(span?.name).toBe('my-span-name');
    expect(span?.ended).toBe(true);
  });

  it('ends the span and propagates the error when the handler throws', async () => {
    await expect(
      withCorrelation({}, 'failing-request', () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.ended).toBe(true);
  });

  it('continues an upstream trace when a W3C traceparent header is present, instead of starting an unrelated one', async () => {
    // A syntactically valid W3C traceparent: version-traceId-spanId-flags.
    const upstreamTraceId = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    const traceparent = `00-${upstreamTraceId}-b1b2b3b4b5b6b7b8-01`;

    let observedId: string | undefined;
    await withCorrelation({ headers: { traceparent } }, 'downstream-request', () => {
      observedId = getCorrelationId();
    });

    expect(observedId).toBe(upstreamTraceId);
  });

  it("supports async handlers, resolving to the handler's return value", async () => {
    const result = await withCorrelation({}, 'async-request', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return 42;
    });

    expect(result).toBe(42);
  });
});
