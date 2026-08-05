import { HttpException, HttpStatus, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { RateLimitConfig } from './rate-limit.decorator.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import type { RateLimiter } from './rate-limiter.js';

function makeContext(req: Partial<Request> & { user?: { userId: string } }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let limiter: { consume: jest.Mock };
  let guard: RateLimitGuard;

  const config: RateLimitConfig = {
    keyPrefix: 'login',
    byIp: { max: 20, windowMs: 900_000 },
    byIdentifier: {
      max: 5,
      windowMs: 900_000,
      extractIdentifier: (req) => (req.body as { email?: string })?.email ?? null,
    },
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    limiter = { consume: jest.fn() };
    guard = new RateLimitGuard(
      reflector as unknown as Reflector,
      limiter as unknown as RateLimiter,
    );
  });

  it('allows the request through when the route declares no @RateLimit(...)', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = makeContext({ ip: '1.2.3.4' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(limiter.consume).not.toHaveBeenCalled();
  });

  describe('scripted brute-force behavior (E2-T21 required test class)', () => {
    it('allows requests while under both the by-IP and by-identifier limits', async () => {
      reflector.getAllAndOverride.mockReturnValue(config);
      limiter.consume.mockResolvedValue({ allowed: true });
      const context = makeContext({ ip: '1.2.3.4', body: { email: 'victim@test.local' } });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(limiter.consume).toHaveBeenCalledWith('ratelimit:login:ip:1.2.3.4', 20, 900_000);
      expect(limiter.consume).toHaveBeenCalledWith(
        'ratelimit:login:id:victim@test.local',
        5,
        900_000,
      );
    });

    it('rejects with 429 once the by-IP counter is exceeded — a single attacker IP cycling through many target emails', async () => {
      reflector.getAllAndOverride.mockReturnValue(config);
      limiter.consume.mockResolvedValueOnce({ allowed: false });
      const context = makeContext({ ip: '1.2.3.4', body: { email: 'victim1@test.local' } });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
      // The by-identifier counter is never even checked once the IP counter already rejects.
      expect(limiter.consume).toHaveBeenCalledTimes(1);
    });

    it('rejects with 429 once the by-identifier counter is exceeded — a distributed/credential-stuffing attempt against one target email from many IPs', async () => {
      reflector.getAllAndOverride.mockReturnValue(config);
      limiter.consume
        .mockResolvedValueOnce({ allowed: true })
        .mockResolvedValueOnce({ allowed: false });
      const context = makeContext({ ip: '9.9.9.9', body: { email: 'victim@test.local' } });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });

    it('skips the by-identifier counter (IP counter still applies) when extractIdentifier finds nothing — e.g. a malformed body with no email', async () => {
      reflector.getAllAndOverride.mockReturnValue(config);
      limiter.consume.mockResolvedValue({ allowed: true });
      const context = makeContext({ ip: '1.2.3.4', body: {} });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(limiter.consume).toHaveBeenCalledTimes(1);
      expect(limiter.consume).toHaveBeenCalledWith('ratelimit:login:ip:1.2.3.4', 20, 900_000);
    });

    it('falls back to "unknown" as the IP key when req.ip is missing, rather than throwing', async () => {
      reflector.getAllAndOverride.mockReturnValue({
        keyPrefix: 'login',
        byIp: { max: 20, windowMs: 900_000 },
      });
      limiter.consume.mockResolvedValue({ allowed: true });
      const context = makeContext({});

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(limiter.consume).toHaveBeenCalledWith('ratelimit:login:ip:unknown', 20, 900_000);
    });
  });

  describe('Redis-outage fail-closed behavior (E2-T21 required test class, Part 11)', () => {
    it('rejects with the same 429 (not a 500, not a silent pass) when the limiter throws — never silently allows unlimited attempts', async () => {
      reflector.getAllAndOverride.mockReturnValue(config);
      limiter.consume.mockRejectedValue(new Error('ECONNREFUSED — Redis unreachable'));
      const context = makeContext({ ip: '1.2.3.4', body: { email: 'victim@test.local' } });

      const outcome = guard.canActivate(context);
      await expect(outcome).rejects.toBeInstanceOf(HttpException);
      await expect(outcome).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    });

    it('fails closed even when only the second (by-identifier) counter check hits the Redis error', async () => {
      reflector.getAllAndOverride.mockReturnValue(config);
      limiter.consume
        .mockResolvedValueOnce({ allowed: true })
        .mockRejectedValueOnce(new Error('ETIMEDOUT'));
      const context = makeContext({ ip: '1.2.3.4', body: { email: 'victim@test.local' } });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });
  });
});
