import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { loadConfig, redisEnvSchema, type RedisEnv } from '@linguaai/config';
import Redis from 'ioredis';

import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimiter } from './rate-limiter.js';
import { RATE_LIMIT_REDIS, RATE_LIMITER } from './rate-limit.tokens.js';

const RATE_LIMIT_REDIS_CONFIG = Symbol('RATE_LIMIT_REDIS_CONFIG');

/**
 * `@Global()` (same pattern as `DatabaseModule`/`EventsModule`) so every
 * feature module can inject `RateLimitGuard` directly. Config loaded inside
 * a provider `useFactory`, not at module-file eval time — the same
 * eager-config-loading pitfall `database.module.ts`/`auth.module.ts`/
 * `events.module.ts` all already hit and fixed.
 *
 * A dedicated `ioredis` connection, separate from `EventsModule`'s BullMQ
 * connection (E2-T20) — different concern (counters vs. job queue), and
 * `maxRetriesPerRequest`/`enableOfflineQueue` are tuned oppositely from
 * what a queue connection wants: a rate-limit check must fail fast when
 * Redis is unreachable (Part 11's fail-closed requirement, above), not
 * queue the command and retry — a queued/retried command would make every
 * request hang until the retry budget is exhausted instead of failing
 * closed promptly.
 */
@Global()
@Module({
  providers: [
    { provide: RATE_LIMIT_REDIS_CONFIG, useFactory: (): RedisEnv => loadConfig(redisEnvSchema) },
    {
      provide: RATE_LIMIT_REDIS,
      // Waits for the connection to actually be `ready` before this
      // provider resolves — `enableOfflineQueue: false` means a command
      // issued before the handshake completes fails immediately, which
      // `RateLimitGuard` correctly (but unhelpfully) treats as fail-closed.
      // Confirmed empirically: without this await, `app.init()` returns
      // (and starts serving real HTTP traffic) before the ioredis
      // connection is ready, spuriously 429-ing the first one or two
      // requests after every cold start — a real bug, not just test
      // flakiness, since the identical race exists in production on every
      // deploy/restart.
      useFactory: async (config: RedisEnv): Promise<Redis> => {
        const redis = new Redis(config.REDIS_URL, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 2000,
          lazyConnect: false,
        });
        await new Promise<void>((resolve, reject) => {
          redis.once('ready', resolve);
          redis.once('error', reject);
        });
        return redis;
      },
      inject: [RATE_LIMIT_REDIS_CONFIG],
    },
    {
      provide: RATE_LIMITER,
      useFactory: (redis: Redis) => new RateLimiter(redis),
      inject: [RATE_LIMIT_REDIS],
    },
    RateLimitGuard,
  ],
  // `RATE_LIMITER` (not just `RateLimitGuard` itself) must be exported:
  // `@UseGuards(RateLimitGuard)` (a class reference, used in AuthModule)
  // makes Nest resolve `RateLimitGuard`'s own constructor dependencies
  // from the *consuming* module's visible providers — `@Global()` only
  // auto-exposes tokens actually listed here, not everything this module
  // happens to provide internally. Confirmed empirically: omitting this
  // failed every e2e test that boots the real app with "Nest can't
  // resolve dependencies of the RateLimitGuard (Reflector, ?)... Symbol(RATE_LIMITER)
  // is not available in the AuthModule module."
  //
  // `RATE_LIMIT_REDIS` itself is exported too (E2-T28) — `JtiDenylistService`
  // (`auth.module.ts`) deliberately reuses this exact connection rather than
  // opening a third one (see its own doc comment for why the fail-fast
  // tuning suits both concerns, just in opposite failure directions). Same
  // "must be listed here explicitly, `@Global()` alone isn't enough"
  // requirement as `RATE_LIMITER` above — confirmed via the identical class
  // of error the first time this was omitted.
  exports: [RateLimitGuard, RATE_LIMITER, RATE_LIMIT_REDIS],
})
export class RateLimitModule implements OnModuleDestroy {
  constructor(@Inject(RATE_LIMIT_REDIS) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
