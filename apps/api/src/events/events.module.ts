import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { loadConfig, redisEnvSchema, type RedisEnv } from '@linguaai/config';
import { createDomainEventsQueue, DomainEventPublisher } from '@linguaai/events';
import type { Queue } from 'bullmq';

export const DOMAIN_EVENTS_QUEUE = Symbol('DOMAIN_EVENTS_QUEUE');

const REDIS_CONFIG = Symbol('REDIS_CONFIG');

/**
 * `@Global()` (same pattern as `DatabaseModule`) so every feature module can
 * inject `DomainEventPublisher` directly. Config is loaded inside a
 * provider `useFactory`, not at module-file eval time — the identical
 * eager-config-loading pitfall `database.module.ts`/`auth.module.ts` both
 * already hit and fixed (E2-T10/T16): a top-level `loadConfig()` call here
 * would crash any unit test that transitively imports this module's barrel
 * for its tokens alone. `DomainEventPublisher`/`createDomainEventsQueue`
 * themselves live in `@linguaai/events` (not here) — `bootstrap-admin.ts`
 * (`packages/database`) also needs them and, per ADR-015, cannot import
 * from `apps/*`.
 */
@Global()
@Module({
  providers: [
    { provide: REDIS_CONFIG, useFactory: (): RedisEnv => loadConfig(redisEnvSchema) },
    {
      provide: DOMAIN_EVENTS_QUEUE,
      useFactory: (config: RedisEnv) => createDomainEventsQueue(config.REDIS_URL),
      inject: [REDIS_CONFIG],
    },
    {
      provide: DomainEventPublisher,
      useFactory: (queue: ReturnType<typeof createDomainEventsQueue>) =>
        new DomainEventPublisher(queue),
      inject: [DOMAIN_EVENTS_QUEUE],
    },
  ],
  exports: [DomainEventPublisher],
})
export class EventsModule implements OnModuleDestroy {
  constructor(@Inject(DOMAIN_EVENTS_QUEUE) private readonly queue: Queue) {}

  /** Closes the BullMQ/ioredis connection on app shutdown — otherwise it's a dangling handle (visible in tests as a lingering open-handle warning, matching the same discipline `prisma-clients.ts` already applies via Prisma's own `$disconnect`). */
  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
