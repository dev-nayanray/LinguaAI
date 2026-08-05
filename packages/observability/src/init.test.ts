import { Writable } from 'node:stream';

import { trace } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterEach, describe, expect, it } from 'vitest';

import { initObservability } from './init.js';

function captureStream() {
  const lines: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  });
  return { stream, lines };
}

describe('initObservability', () => {
  afterEach(() => {
    trace.disable();
  });

  it('initializes the OTel SDK without throwing, using injected (non-network) processors', () => {
    const spanExporter = new InMemorySpanExporter();

    expect(() =>
      initObservability({
        serviceName: 'test-service',
        env: {},
        spanProcessors: [new SimpleSpanProcessor(spanExporter)],
        metricReaders: [],
      }),
    ).not.toThrow();
  });

  it('a span created after init is exportable via the configured span processor', async () => {
    const spanExporter = new InMemorySpanExporter();
    const handle = initObservability({
      serviceName: 'test-service',
      env: {},
      spanProcessors: [new SimpleSpanProcessor(spanExporter)],
      metricReaders: [],
    });

    trace.getTracer('test').startActiveSpan('boot-test-span', (span) => {
      span.end();
    });

    const exported = spanExporter.getFinishedSpans();
    expect(exported).toHaveLength(1);
    const [span] = exported;
    expect(span?.name).toBe('boot-test-span');
    expect(span?.resource.attributes['service.name']).toBe('test-service');

    await handle.shutdown();
  });

  it('emits a structured JSON log line with a requestId when logging inside a traced request', () => {
    const { stream, lines } = captureStream();
    const spanExporter = new InMemorySpanExporter();
    const handle = initObservability({
      serviceName: 'test-service',
      env: {},
      spanProcessors: [new SimpleSpanProcessor(spanExporter)],
      metricReaders: [],
      loggerDestination: stream,
    });

    trace.getTracer('test').startActiveSpan('request-span', (span) => {
      handle.logger.info('handling request');

      const [line] = lines;
      expect(line).toMatchObject({
        level: 'info',
        service: 'test-service',
        message: 'handling request',
      });
      expect(line?.requestId).toBe(span.spanContext().traceId);
      span.end();
    });
  });

  it('does not throw when OTEL_EXPORTER_OTLP_ENDPOINT is unset and no processors are injected (no crash without a collector)', () => {
    expect(() =>
      initObservability({
        serviceName: 'test-service',
        env: {},
      }),
    ).not.toThrow();
  });

  it('constructs real OTLP trace/metric exporters without throwing when OTEL_EXPORTER_OTLP_ENDPOINT IS configured', async () => {
    // Constructing an OTLPTraceExporter/OTLPMetricExporter never makes a
    // network call by itself — only actually exporting data would — so this
    // exercises the real production code path (Part 8: ADOT sidecar/local
    // otel-collector) without needing a collector running for this test.
    const handle = initObservability({
      serviceName: 'test-service',
      env: { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318' },
    });

    expect(handle.logger).toBeDefined();
    await handle.shutdown();
  });
});
