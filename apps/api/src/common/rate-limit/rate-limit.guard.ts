import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { RATE_LIMIT_KEY, type RateLimitConfig } from './rate-limit.decorator.js';
import { RateLimiter } from './rate-limiter.js';
import { RATE_LIMITER } from './rate-limit.tokens.js';

/**
 * Redis-backed, distributed rate limiter for auth endpoints (Part 6/8/11,
 * SECURITY.md §2/§6, E2-T21). No `@RateLimit(...)` decorator on a route
 * means this guard is a no-op for it — opt-in, matching `RolesGuard`'s own
 * "no decorator, no restriction" default.
 *
 * Fails CLOSED on any Redis error (Part 11's explicit failure-mode table:
 * "Rate limiting fails closed on auth endpoints specifically — reject
 * rather than silently allow unlimited attempts, SECURITY.md's brute-force
 * protection must not silently degrade") — the caller sees the identical
 * 429 a genuine over-limit request would produce, both because that's the
 * correct fail-closed behavior and because a distinct error response would
 * itself leak "Redis is down" to a probing attacker.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.getAllAndOverride<RateLimitConfig | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!config) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user?: { userId: string } }>();

    try {
      const ip = req.ip ?? 'unknown';
      const ipResult = await this.limiter.consume(
        `ratelimit:${config.keyPrefix}:ip:${ip}`,
        config.byIp.max,
        config.byIp.windowMs,
      );
      if (!ipResult.allowed) {
        throw this.tooManyRequests();
      }

      if (config.byIdentifier) {
        const identifier = config.byIdentifier.extractIdentifier(req);
        if (identifier) {
          const idResult = await this.limiter.consume(
            `ratelimit:${config.keyPrefix}:id:${identifier.toLowerCase()}`,
            config.byIdentifier.max,
            config.byIdentifier.windowMs,
          );
          if (!idResult.allowed) {
            throw this.tooManyRequests();
          }
        }
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Any other error (Redis unreachable, timed out, etc.) — fail closed.
      throw this.tooManyRequests();
    }

    return true;
  }

  private tooManyRequests(): HttpException {
    return new HttpException('Too many requests — try again later', HttpStatus.TOO_MANY_REQUESTS);
  }
}
