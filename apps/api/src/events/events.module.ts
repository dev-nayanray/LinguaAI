import { Global, Inject, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { loadConfig, redisEnvSchema, type RedisEnv } from '@linguaai/config';
import {
  createDomainEventsQueues,
  DomainEventPublisher,
  type DomainEventConsumer,
} from '@linguaai/events';
import type { Queue } from 'bullmq';

export const DOMAIN_EVENTS_QUEUES = Symbol('DOMAIN_EVENTS_QUEUES');

const REDIS_CONFIG = Symbol('REDIS_CONFIG');

/**
 * `@Global()` (same pattern as `DatabaseModule`) so every feature module can
 * inject `DomainEventPublisher` directly. Config is loaded inside a
 * provider `useFactory`, not at module-file eval time — the identical
 * eager-config-loading pitfall `database.module.ts`/`auth.module.ts` both
 * already hit and fixed (E2-T10/T16): a top-level `loadConfig()` call here
 * would crash any unit test that transitively imports this module's barrel
 * for its tokens alone. `DomainEventPublisher`/`createDomainEventsQueues`
 * themselves live in `@linguaai/events` (not here) — `bootstrap-admin.ts`
 * (`packages/database`) also needs them and, per ADR-015, cannot import
 * from `apps/*`.
 *
 * E16 T1: `DOMAIN_EVENTS_QUEUE` (singular) is now `DOMAIN_EVENTS_QUEUES` —
 * `apps/api` fans every published event out to one real queue per
 * registered consumer (closes RISK_REGISTER R-89), not one shared,
 * competing-consumers queue.
 */
@Global()
@Module({
  providers: [
    { provide: REDIS_CONFIG, useFactory: (): RedisEnv => loadConfig(redisEnvSchema) },
    {
      provide: DOMAIN_EVENTS_QUEUES,
      useFactory: (config: RedisEnv) => createDomainEventsQueues(config.REDIS_URL),
      inject: [REDIS_CONFIG],
    },
    {
      provide: DomainEventPublisher,
      useFactory: (queues: Record<DomainEventConsumer, Queue>) =>
        new DomainEventPublisher(Object.values(queues)),
      inject: [DOMAIN_EVENTS_QUEUES],
    },
  ],
  exports: [DomainEventPublisher],
})
export class EventsModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(DOMAIN_EVENTS_QUEUES) private readonly queues: Record<DomainEventConsumer, Queue>,
  ) {}

  /**
   * Real bug found while building this task's own e2e suite
   * (`app.e2e-spec.ts`) — a `Queue`'s underlying ioredis connection is
   * still mid-handshake for a moment after `new Queue()` returns. A test
   * that boots `AppModule` and tears it down again almost immediately (a
   * plain health check, nothing else to await) could call `.close()`
   * while a handshake command was still in flight, which ioredis/BullMQ
   * reject with "Connection is closed" as an unhandled rejection, not
   * something an `'error'` listener catches (a rejected in-flight command
   * promise, not an emitted event). Waiting for every queue to actually be
   * ready before `onModuleInit` (and therefore `app.init()`) resolves
   * closes that window.
   */
  async onModuleInit(): Promise<void> {
    await Promise.all(Object.values(this.queues).map((queue) => queue.waitUntilReady()));
  }

  /** Closes every consumer's own BullMQ/ioredis connection on app shutdown — otherwise each is a dangling handle (visible in tests as a lingering open-handle warning, matching the same discipline `prisma-clients.ts` already applies via Prisma's own `$disconnect`). */
  async onModuleDestroy(): Promise<void> {
    await Promise.all(Object.values(this.queues).map((queue) => queue.close()));
  }
}
