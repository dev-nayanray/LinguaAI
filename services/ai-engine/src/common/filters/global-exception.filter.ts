import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { getCorrelationId, type Logger } from '@linguaai/observability';
import { LOGGER } from '@linguaai/observability/nestjs';
import type { Request, Response } from 'express';

// API_GUIDELINES.md §3 — the full machine-readable error code registry.
// New codes are added there first, never invented ad hoc here. Copied from
// apps/api's own GlobalExceptionFilter (ADR-033, T10 — ai-engine's first
// real REST controller) rather than extracted into a shared package: same
// reasoning as ZodValidationPipe's own doc comment.
const STATUS_TO_CODE: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'AUTH_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'SEMANTIC_VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  502: 'UPSTREAM_UNAVAILABLE',
  503: 'UPSTREAM_UNAVAILABLE',
};

function extractMessage(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') {
    return body;
  }
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message: unknown }).message;
    return Array.isArray(message) ? message.join(', ') : String(message);
  }
  return exception.message;
}

/**
 * Single global exception filter mapping every thrown error to the
 * API.md §4 / API_GUIDELINES.md §3 envelope — `{ error: { code, message,
 * requestId } }`. Only applies to a "before streaming started" failure
 * for the SSE endpoint (agent-sessions.controller.ts) — once SSE headers
 * are flushed, a mid-stream failure is reported as an `error` event inside
 * the stream itself, never through this filter (headers are already sent).
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR';
    const message =
      exception instanceof HttpException
        ? extractMessage(exception)
        : 'An unexpected error occurred';
    const requestId = getCorrelationId();
    const path = request.originalUrl.split('?')[0];

    this.logger.error(
      { err: exception, status, method: request.method, path },
      'unhandled exception',
    );

    response.status(status).json({
      error: {
        code,
        message,
        ...(requestId ? { requestId } : {}),
      },
    });
  }
}
