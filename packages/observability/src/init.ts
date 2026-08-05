import { metrics as otelMetrics } from '@opentelemetry/api';
import { loadConfig, observabilityEnvSchema } from '@linguaai/config';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  type MetricReader,
} from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

import { createLogger, type Logger } from './logger.js';

export interface InitObservabilityOptions {
  /** Used as the OTel `service.name` resource attribute and pino's `service` base field. */
  serviceName: string;
  /** Defaults to `process.env`. Override in tests. */
  env?: Record<string, string | undefined>;
  /**
   * Override span processors — used by tests to inject an in-memory
   * exporter instead of a real OTLP one. Defaults to a `BatchSpanProcessor`
   * exporting to `OTEL_EXPORTER_OTLP_ENDPOINT` if configured, or no
   * processor at all (spans are created but not exported) if not — a
   * missing endpoint must not crash a skeleton app's boot sequence.
   */
  spanProcessors?: SpanProcessor[];
  /** Override metric readers — same rationale as `spanProcessors`. */
  metricReaders?: MetricReader[];
  /** Override the logger's output destination (defaults to stdout) — used by tests to capture log output. */
  loggerDestination?: NodeJS.WritableStream;
}

export interface ObservabilityHandle {
  logger: Logger;
  /** Flushes and shuts down the trace/metric providers — call on process exit. */
  shutdown: () => Promise<void>;
}

/**
 * Bootstraps OpenTelemetry tracing + metrics and returns a service-scoped
 * structured logger. This is the ONE place every app/service wires up
 * observability (E1 Part 7/8, ADR-016) — must be called before any other
 * export of this package (correlation IDs, metric instruments) is used.
 */
export function initObservability(options: InitObservabilityOptions): ObservabilityHandle {
  const config = loadConfig(observabilityEnvSchema, options.env);
  const resource = new Resource({ [ATTR_SERVICE_NAME]: options.serviceName });

  const spanProcessors =
    options.spanProcessors ??
    (config.OTEL_EXPORTER_OTLP_ENDPOINT
      ? [
          new BatchSpanProcessor(
            new OTLPTraceExporter({ url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` }),
          ),
        ]
      : []);

  const tracerProvider = new NodeTracerProvider({ resource, spanProcessors });
  tracerProvider.register();

  const metricReaders =
    options.metricReaders ??
    (config.OTEL_EXPORTER_OTLP_ENDPOINT
      ? [
          new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({
              url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
            }),
          }),
        ]
      : []);

  const meterProvider = new MeterProvider({ resource, readers: metricReaders });
  otelMetrics.setGlobalMeterProvider(meterProvider);

  const logger = createLogger({
    serviceName: options.serviceName,
    level: config.LOG_LEVEL,
    destination: options.loggerDestination,
  });

  return {
    logger,
    shutdown: async () => {
      await tracerProvider.shutdown();
      await meterProvider.shutdown();
    },
  };
}
