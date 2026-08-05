import { Writable } from 'node:stream';

import { trace } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createLogger } from './logger.js';

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

describe('createLogger', () => {
  let provider: NodeTracerProvider;

  beforeEach(() => {
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())],
    });
    provider.register();
  });

  afterEach(async () => {
    trace.disable();
    await provider.shutdown();
  });

  it('emits a structured JSON log line with timestamp, level, service, and message', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger({ serviceName: 'test-service', destination: stream });

    logger.info('hello world');

    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line).toMatchObject({
      level: 'info',
      service: 'test-service',
      message: 'hello world',
    });
    expect(line?.timestamp).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    // pino's default `msg`/numeric `level` keys must not leak through once renamed.
    expect(line).not.toHaveProperty('msg');
    expect(line?.level).not.toBeTypeOf('number');
  });

  it('includes a requestId matching the active span trace ID when logging inside a traced context', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger({ serviceName: 'test-service', destination: stream });
    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('test-span', (span) => {
      logger.info('inside a trace');
      const [line] = lines;
      expect(line?.requestId).toBe(span.spanContext().traceId);
      span.end();
    });
  });

  it('omits requestId entirely when logging outside any traced context', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger({ serviceName: 'test-service', destination: stream });

    logger.info('no trace here');

    const [line] = lines;
    expect(line).not.toHaveProperty('requestId');
  });

  it('respects the configured log level, suppressing lower-priority lines', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger({
      serviceName: 'test-service',
      level: 'warn',
      destination: stream,
    });

    logger.info('should be suppressed');
    logger.warn('should appear');

    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line?.message).toBe('should appear');
  });

  it('supports child loggers for request-scoped fields like userId/tenantId', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger({ serviceName: 'test-service', destination: stream });

    const child = logger.child({ userId: 'user-123', tenantId: 'org-456' });
    child.info('scoped log');

    const [line] = lines;
    expect(line).toMatchObject({ userId: 'user-123', tenantId: 'org-456' });
  });
});
