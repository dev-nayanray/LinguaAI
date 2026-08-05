import { metrics as otelMetrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetMetricsForTesting,
  dbQueryDuration,
  httpErrorsTotal,
  httpRequestDuration,
  httpRequestsTotal,
} from './metrics.js';

describe('base metric instruments', () => {
  let exporter: InMemoryMetricExporter;
  let reader: PeriodicExportingMetricReader;
  let provider: MeterProvider;

  beforeEach(() => {
    exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    provider = new MeterProvider({ readers: [reader] });
    otelMetrics.setGlobalMeterProvider(provider);
    _resetMetricsForTesting();
  });

  afterEach(async () => {
    await provider.shutdown();
    otelMetrics.disable();
    _resetMetricsForTesting();
  });

  async function collectedMetricNames(): Promise<string[]> {
    await provider.forceFlush();
    const [resourceMetrics] = exporter.getMetrics();
    return (resourceMetrics?.scopeMetrics ?? []).flatMap((scope) =>
      scope.metrics.map((m) => m.descriptor.name),
    );
  }

  it('httpRequestDuration records a histogram value under the documented metric name', async () => {
    httpRequestDuration().record(0.42, { route: '/health', method: 'GET' });

    expect(await collectedMetricNames()).toContain('http_request_duration_seconds');
  });

  it('httpRequestsTotal increments a counter under the documented metric name', async () => {
    httpRequestsTotal().add(1, { route: '/health' });

    expect(await collectedMetricNames()).toContain('http_requests_total');
  });

  it('httpErrorsTotal increments a counter under the documented metric name', async () => {
    httpErrorsTotal().add(1, { route: '/health', status: 500 });

    expect(await collectedMetricNames()).toContain('http_errors_total');
  });

  it('dbQueryDuration records a histogram value under the documented metric name', async () => {
    dbQueryDuration().record(0.013, { table: 'users' });

    expect(await collectedMetricNames()).toContain('db_query_duration_seconds');
  });

  it('returns the same memoized instrument instance across repeated calls', () => {
    expect(httpRequestDuration()).toBe(httpRequestDuration());
  });
});
