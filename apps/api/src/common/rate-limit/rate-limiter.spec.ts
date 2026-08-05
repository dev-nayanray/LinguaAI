import type { Redis } from 'ioredis';

import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  let redis: { incr: jest.Mock; pexpire: jest.Mock };
  let limiter: RateLimiter;

  beforeEach(() => {
    redis = { incr: jest.fn(), pexpire: jest.fn().mockResolvedValue(1) };
    limiter = new RateLimiter(redis as unknown as Redis);
  });

  it('allows the first request and sets the window expiry exactly once', async () => {
    redis.incr.mockResolvedValue(1);
    const result = await limiter.consume('key-1', 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(redis.pexpire).toHaveBeenCalledWith('key-1', 60_000);
  });

  it('allows requests up to and including the limit, without re-setting expiry after the first', async () => {
    redis.incr.mockResolvedValue(5);
    const result = await limiter.consume('key-1', 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(redis.pexpire).not.toHaveBeenCalled();
  });

  it('denies once the count exceeds the limit', async () => {
    redis.incr.mockResolvedValue(6);
    const result = await limiter.consume('key-1', 5, 60_000);
    expect(result.allowed).toBe(false);
  });

  it('propagates a Redis error rather than swallowing it — the caller (RateLimitGuard) is responsible for fail-closed behavior', async () => {
    const redisError = new Error('ECONNREFUSED');
    redis.incr.mockRejectedValue(redisError);
    await expect(limiter.consume('key-1', 5, 60_000)).rejects.toBe(redisError);
  });
});
