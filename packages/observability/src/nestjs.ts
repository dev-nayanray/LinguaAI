import {
  type DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  type NestMiddleware,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { initObservability, type ObservabilityHandle } from './init.js';
import type { Logger } from './logger.js';
import { withCorrelation } from './middleware.js';

export const OBSERVABILITY_HANDLE = Symbol('OBSERVABILITY_HANDLE');
export const LOGGER = Symbol('LOGGER');

/**
 * Shared NestJS observability wiring (@linguaai/observability/nestjs) —
 * every apps/api and services/* skeleton uses this via
 * `ObservabilityModule.forRoot('<service-name>')`, rather than each
 * hand-rolling its own copy of this bootstrap (OBSERVABILITY.md, ADR-016:
 * "packages/observability becomes a required dependency of every
 * apps/*\/services/* skeleton"). `forRoot` (not a bare `@Module()`) because
 * each consumer needs a different `service.name` resource attribute/pino
 * `service` field — a plain static module can't take a runtime argument.
 */
@Global()
@Module({})
export class ObservabilityModule implements OnApplicationShutdown {
  constructor(@Inject(OBSERVABILITY_HANDLE) private readonly handle: ObservabilityHandle) {}

  static forRoot(serviceName: string): DynamicModule {
    return {
      module: ObservabilityModule,
      providers: [
        {
          provide: OBSERVABILITY_HANDLE,
          useFactory: (): ObservabilityHandle => initObservability({ serviceName }),
        },
        {
          provide: LOGGER,
          useFactory: (handle: ObservabilityHandle): Logger => handle.logger,
          inject: [OBSERVABILITY_HANDLE],
        },
      ],
      exports: [OBSERVABILITY_HANDLE, LOGGER],
    };
  }

  /** Requires `app.enableShutdownHooks()` in main.ts to actually fire. */
  async onApplicationShutdown(): Promise<void> {
    await this.handle.shutdown();
  }
}

/**
 * Request-lifecycle logging + trace propagation (OBSERVABILITY.md §2/§3,
 * ADR-016): brackets every request with an incoming-request log line and a
 * response log line (status, duration), and wraps the whole request in an
 * OTel span via `withCorrelation` — extracting an incoming `traceparent`
 * header if present, continuing that trace rather than starting an
 * unrelated one. Everything downstream inherits the resulting active
 * span/correlation ID through Node's AsyncLocalStorage-based context
 * propagation, since it all runs inside the same async chain kicked off by
 * `next()` below.
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    // req.path is unreliable this early in the middleware chain — see
    // apps/api's original T13 report for the empirical finding (span
    // name/log both read "/" against a live server). req.originalUrl
    // stays correct throughout; the query string is stripped before
    // logging since it can carry secrets (PII redaction, OBSERVABILITY.md
    // §1).
    const path = req.originalUrl.split('?')[0];

    void withCorrelation(
      { headers: req.headers },
      `${req.method} ${path}`,
      () =>
        new Promise<void>((resolve) => {
          this.logger.info({ method: req.method, path }, 'incoming request');

          res.on('finish', () => {
            this.logger.info(
              {
                method: req.method,
                path,
                status: res.statusCode,
                durationMs: Date.now() - startTime,
              },
              'request completed',
            );
            resolve();
          });

          next();
        }),
    );
  }
}
