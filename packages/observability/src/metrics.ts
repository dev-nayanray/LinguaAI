import { metrics as otelMetrics, type Counter, type Histogram } from '@opentelemetry/api';

const METER_NAME = '@linguaai/observability';

function getMeter() {
  return otelMetrics.getMeter(METER_NAME);
}

/**
 * Base metric instruments (OBSERVABILITY.md §2's "Application (baseline,
 * every service)" catalog). Each is created lazily on first call, against
 * whichever meter provider is globally registered AT THAT MOMENT — never
 * eagerly at module-import time. `initObservability()` must run (and
 * register a real MeterProvider) before these are first invoked, or they
 * bind to the API's no-op meter and silently record nothing; creating them
 * eagerly at import time would risk exactly that if this module happened to
 * be imported before `initObservability()` runs.
 */

let httpRequestDurationInstrument: Histogram | undefined;
export function httpRequestDuration(): Histogram {
  httpRequestDurationInstrument ??= getMeter().createHistogram('http_request_duration_seconds', {
    description: 'HTTP request duration in seconds',
    unit: 's',
  });
  return httpRequestDurationInstrument;
}

let httpRequestsTotalInstrument: Counter | undefined;
export function httpRequestsTotal(): Counter {
  httpRequestsTotalInstrument ??= getMeter().createCounter('http_requests_total', {
    description: 'Total HTTP requests handled',
  });
  return httpRequestsTotalInstrument;
}

let httpErrorsTotalInstrument: Counter | undefined;
export function httpErrorsTotal(): Counter {
  httpErrorsTotalInstrument ??= getMeter().createCounter('http_errors_total', {
    description: 'Total HTTP error responses',
  });
  return httpErrorsTotalInstrument;
}

let dbQueryDurationInstrument: Histogram | undefined;
export function dbQueryDuration(): Histogram {
  dbQueryDurationInstrument ??= getMeter().createHistogram('db_query_duration_seconds', {
    description: 'Database query duration in seconds',
    unit: 's',
  });
  return dbQueryDurationInstrument;
}

/** Test-only: clears memoized instruments so a fresh MeterProvider (e.g. a
 * new InMemoryMetricExporter per test) is picked up on next use. */
export function _resetMetricsForTesting(): void {
  httpRequestDurationInstrument = undefined;
  httpRequestsTotalInstrument = undefined;
  httpErrorsTotalInstrument = undefined;
  dbQueryDurationInstrument = undefined;
}
