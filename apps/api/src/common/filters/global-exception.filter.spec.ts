import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import type { Logger } from '@linguaai/observability';

import { GlobalExceptionFilter } from './global-exception.filter.js';

function createHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', originalUrl: '/v1/whatever' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

function createLogger(): Logger {
  return { error: jest.fn() } as unknown as Logger;
}

describe('GlobalExceptionFilter', () => {
  it('maps a NestJS HttpException to its status and registry code', () => {
    const logger = createLogger();
    const filter = new GlobalExceptionFilter(logger);
    const { host, json, status } = createHost();

    filter.catch(new NotFoundException('lesson not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'lesson not found' },
    });
  });

  it('extracts the message from a BadRequestException validation-style response body', () => {
    const logger = createLogger();
    const filter = new GlobalExceptionFilter(logger);
    const { host, json } = createHost();

    filter.catch(new BadRequestException(['email must be valid', 'name is required']), host);

    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'email must be valid, name is required',
      },
    });
  });

  it('uses a plain string HttpException response body directly as the message', () => {
    const logger = createLogger();
    const filter = new GlobalExceptionFilter(logger);
    const { host, json } = createHost();

    filter.catch(new HttpException('plain string body', 409), host);

    expect(json).toHaveBeenCalledWith({
      error: { code: 'CONFLICT', message: 'plain string body' },
    });
  });

  it("falls back to the exception's own message when the response body has no message key", () => {
    const logger = createLogger();
    const filter = new GlobalExceptionFilter(logger);
    const { host, json } = createHost();

    filter.catch(new HttpException({ reason: 'no message key here' }, 400), host);

    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.any(String) as unknown as string,
      },
    });
  });

  it('maps an unrecognized (non-HttpException) error to 500 INTERNAL_ERROR with a fixed, generic message', () => {
    const logger = createLogger();
    const filter = new GlobalExceptionFilter(logger);
    const { host, json, status } = createHost();

    filter.catch(new Error('a raw stack-trace-y internal detail'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });

  it('never leaks the raw error message of an unrecognized error to the client', () => {
    const logger = createLogger();
    const filter = new GlobalExceptionFilter(logger);
    const { host, json } = createHost();

    filter.catch(new Error('super secret internal detail'), host);

    const [[body]] = json.mock.calls as [[{ error: { message: string } }]];
    expect(body.error.message).not.toContain('super secret internal detail');
  });

  it('logs the real error server-side regardless of what is sent to the client', () => {
    const logger = createLogger();
    const filter = new GlobalExceptionFilter(logger);
    const { host } = createHost();
    const error = new Error('boom');

    filter.catch(error, host);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, status: 500, method: 'GET', path: '/v1/whatever' }),
      'unhandled exception',
    );
  });
});
