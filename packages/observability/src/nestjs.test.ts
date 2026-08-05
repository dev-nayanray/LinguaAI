import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LOGGER,
  ObservabilityModule,
  OBSERVABILITY_HANDLE,
  RequestLoggingMiddleware,
} from './nestjs.js';

function createLogger() {
  return { info: vi.fn(), error: vi.fn() };
}

function createResponse(): { res: Response; triggerFinish: () => void } {
  let finishCallback: (() => void) | undefined;
  const res = {
    statusCode: 200,
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'finish') {
        finishCallback = cb;
      }
    }),
  } as unknown as Response;
  return { res, triggerFinish: () => finishCallback?.() };
}

describe('ObservabilityModule.forRoot', () => {
  it('returns a dynamic module scoped to the given service name', () => {
    const dynamicModule = ObservabilityModule.forRoot('my-service');

    expect(dynamicModule.module).toBe(ObservabilityModule);
    expect(dynamicModule.exports).toEqual([OBSERVABILITY_HANDLE, LOGGER]);
    expect(dynamicModule.providers).toHaveLength(2);
  });

  it('the OBSERVABILITY_HANDLE factory calls initObservability with the given service name', () => {
    const dynamicModule = ObservabilityModule.forRoot('my-service');
    const handleProvider = dynamicModule.providers?.find(
      (p): p is { provide: symbol; useFactory: () => unknown } =>
        typeof p === 'object' && 'provide' in p && p.provide === OBSERVABILITY_HANDLE,
    );

    expect(handleProvider).toBeDefined();
    const handle = handleProvider?.useFactory() as { logger: { info: unknown } };
    expect(handle.logger).toBeDefined();
  });

  it('the LOGGER factory returns the handle logger', () => {
    const dynamicModule = ObservabilityModule.forRoot('my-service');
    const loggerProvider = dynamicModule.providers?.find(
      (p): p is { provide: symbol; useFactory: (handle: { logger: unknown }) => unknown } =>
        typeof p === 'object' && 'provide' in p && p.provide === LOGGER,
    );

    expect(loggerProvider).toBeDefined();
    const fakeHandle = { logger: { info: vi.fn() } };
    expect(loggerProvider?.useFactory(fakeHandle)).toBe(fakeHandle.logger);
  });

  it('onApplicationShutdown calls the handle shutdown', async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined);
    const module = new ObservabilityModule({ logger: createLogger(), shutdown } as never);

    await module.onApplicationShutdown();

    expect(shutdown).toHaveBeenCalledTimes(1);
  });
});

describe('RequestLoggingMiddleware', () => {
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs an incoming-request line and calls next() before the response finishes', () => {
    const middleware = new RequestLoggingMiddleware(logger as unknown as never);
    const req = { method: 'GET', originalUrl: '/health', headers: {} } as unknown as Request;
    const { res } = createResponse();
    const next: NextFunction = vi.fn();

    middleware.use(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      { method: 'GET', path: '/health' },
      'incoming request',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('logs a response-completed line with method, path, status, and duration', () => {
    const middleware = new RequestLoggingMiddleware(logger as unknown as never);
    const req = { method: 'POST', originalUrl: '/whatever', headers: {} } as unknown as Request;
    const { res, triggerFinish } = createResponse();
    res.statusCode = 201;

    middleware.use(req, res, vi.fn());
    triggerFinish();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', path: '/whatever', status: 201 }),
      'request completed',
    );
  });

  it('strips the query string from the logged path', () => {
    const middleware = new RequestLoggingMiddleware(logger as unknown as never);
    const req = {
      method: 'GET',
      originalUrl: '/search?apiKey=secret',
      headers: {},
    } as unknown as Request;
    const { res } = createResponse();

    middleware.use(req, res, vi.fn());

    expect(logger.info).toHaveBeenCalledWith(
      { method: 'GET', path: '/search' },
      'incoming request',
    );
  });
});
