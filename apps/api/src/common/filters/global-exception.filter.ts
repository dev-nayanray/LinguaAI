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
// New codes are added there first, never invented ad hoc here.
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
 * requestId } }`. `requestId` is the OTel trace ID (getCorrelationId,
 * ADR-016), the SAME identifier as the request's log lines, not a
 * separately-generated ID. Unexpected (non-HttpException) errors return a
 * fixed, generic message — the real error is logged server-side with full
 * context but never sent to the client (SECURITY.md information-disclosure
 * discipline).
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
    // req.path can be unreliable depending on how far routing got before
    // the exception was thrown — req.originalUrl (minus query string,
    // which may carry secrets) is reliable throughout, matching
    // @linguaai/observability/nestjs's RequestLoggingMiddleware.
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
