import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { loadConfig, redisEnvSchema, type RedisEnv } from '@linguaai/config';
import Redis from 'ioredis';

export const AI_ENGINE_REDIS = Symbol('AI_ENGINE_REDIS');
const AI_ENGINE_REDIS_CONFIG = Symbol('AI_ENGINE_REDIS_CONFIG');

/**
 * `@Global()`, config-in-factory, fail-fast connection tuning, and the
 * await-`ready`-before-resolving startup-race fix — all mirroring
 * `apps/api`'s own `RateLimitModule` (apps/api/src/common/rate-limit/
 * rate-limit.module.ts) exactly, the closest existing analog: a
 * hot-path counter connection, not a job queue. A dedicated connection,
 * not shared with anything else in this service (there is nothing else
 * yet) — `CircuitBreakerService` (T9) needs the same fail-fast semantics
 * `RateLimitGuard` does: a spend check must fail fast when Redis is
 * unreachable, not queue and retry.
 */
@Global()
@Module({
  providers: [
    { provide: AI_ENGINE_REDIS_CONFIG, useFactory: (): RedisEnv => loadConfig(redisEnvSchema) },
    {
      provide: AI_ENGINE_REDIS,
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
      inject: [AI_ENGINE_REDIS_CONFIG],
    },
  ],
  exports: [AI_ENGINE_REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(AI_ENGINE_REDIS) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
