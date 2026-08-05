import type { Redis } from 'ioredis';

export interface ConsumeResult {
  allowed: boolean;
}

/**
 * Fixed-window counter via `INCR`+`PEXPIRE` (Part 8/11, SECURITY.md §2/§6's
 * "distributed rate limiter shared across the horizontally-scaled fleet" —
 * Redis, not per-instance memory, since an in-memory counter would be
 * silently bypassable across instances, ARCHITECTURE.md §7). Fixed-window,
 * not sliding-window/token-bucket — a benign race at the window boundary
 * can only ever let one or two extra requests through, which doesn't
 * meaningfully weaken brute-force protection at these limits, and a fixed
 * window is one round trip per check rather than a Lua script or sorted-set
 * bookkeeping.
 *
 * Deliberately does not catch Redis errors — `RateLimitGuard` (the only
 * caller) must fail closed on any error reaching this class (Part 11:
 * "Rate limiting fails closed on auth endpoints specifically... must not
 * silently degrade"), so swallowing an error here and returning a
 * default `allowed` value would be exactly the silent-degradation bug that
 * requirement exists to prevent.
 */
export class RateLimiter {
  constructor(private readonly redis: Redis) {}

  async consume(key: string, max: number, windowMs: number): Promise<ConsumeResult> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.pexpire(key, windowMs);
    }
    return { allowed: count <= max };
  }
}
