import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from '@linguaai/observability';
import { LOGGER } from '@linguaai/observability/nestjs';
import type { BillingStatusResponse } from '@linguaai/validation/commerce';
import type Redis from 'ioredis';

import { BILLING_REDIS } from './billing-redis.token.js';

const KEY_PREFIX = 'billing:entitlement:';
/**
 * A real, modest TTL as defense-in-depth (§3.3/T3) — invalidation is
 * always synchronous on every real write this service makes
 * (`BillingService.syncEntitlement()`), so this TTL is never the
 * *primary* freshness mechanism; it only bounds staleness from a write
 * this application layer didn't make (e.g. a direct SQL `UPDATE
 * "Entitlement"` by an operator), the one class of change synchronous
 * invalidation structurally cannot see.
 */
const TTL_SECONDS = 60;

/**
 * Redis-cached entitlement resolution (E15 T3, design doc §3.3's own
 * deferred optimization). Deliberately **fail-open**, not fail-closed —
 * unlike `RateLimiter`'s own security-motivated fail-closed design
 * (`rate-limit.module.ts`), a Redis outage here must never turn into
 * every request being denied Premium access it's actually entitled to,
 * or every request being wrongly granted access it isn't; either way, a
 * cache failure means "read Postgres directly instead," never "guess."
 * `get()` returns `null` (a cache miss) on any Redis error, letting the
 * caller fall through to its own real Postgres read.
 */
@Injectable()
export class EntitlementCacheService {
  constructor(
    @Inject(BILLING_REDIS) private readonly redis: Redis,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async get(userId: string): Promise<BillingStatusResponse | null> {
    try {
      const raw = await this.redis.get(KEY_PREFIX + userId);
      return raw ? (JSON.parse(raw) as BillingStatusResponse) : null;
    } catch (err) {
      this.logger.warn({ err, userId }, 'Entitlement cache read failed, falling back to Postgres');
      return null;
    }
  }

  async set(userId: string, status: BillingStatusResponse): Promise<void> {
    try {
      await this.redis.set(KEY_PREFIX + userId, JSON.stringify(status), 'EX', TTL_SECONDS);
    } catch (err) {
      this.logger.warn({ err, userId }, 'Entitlement cache write failed, continuing without it');
    }
  }

  /** Called synchronously by every real entitlement-changing write (§3.3) — never a TTL-only strategy. */
  async invalidate(userId: string): Promise<void> {
    try {
      await this.redis.del(KEY_PREFIX + userId);
    } catch (err) {
      this.logger.warn(
        { err, userId },
        'Entitlement cache invalidation failed -- stale data may be served for up to the TTL',
      );
    }
  }
}
