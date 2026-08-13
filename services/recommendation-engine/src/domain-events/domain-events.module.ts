import { Inject, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { loadConfig, redisEnvSchema, type RedisEnv } from '@linguaai/config';
import { domainEventsQueueName, type DomainEvent } from '@linguaai/events';
import { Worker, type Job } from 'bullmq';

import { LearningPlanModule } from '../learning-plan/learning-plan.module.js';
import { DomainEventDispatcher } from './domain-event-dispatcher.service.js';

const DOMAIN_EVENTS_REDIS_CONFIG = Symbol('DOMAIN_EVENTS_REDIS_CONFIG');

/**
 * `recommendation-engine`'s own event consumer (E7 T2) — the first real
 * BullMQ *consumer* of the shared `domain-events` queue anywhere in this
 * platform (`packages/events/src/domain-event.ts`'s own header comment:
 * "no consumer... exists yet to read this queue"). Mirrors `ai-engine`'s
 * own `PartitionMaintenanceModule` (ADR-035) for the `Worker`
 * construction/lifecycle mechanics — the first `Worker` this repo ever
 * ran — but this module is a pure consumer of an externally-produced
 * queue, not a self-scheduling job producer, so it registers no repeatable
 * job of its own. The real dispatch/filtering logic lives in
 * `DomainEventDispatcher`, a plain injectable class, not here — this file
 * is wiring only (and, matching `PartitionMaintenanceModule`'s own
 * precedent, `*.module.ts` files are exempt from this repo's coverage
 * requirement).
 *
 * **RISK_REGISTER R-89 — closed at E16 T1.** `domain-events` used to be one
 * shared BullMQ queue for every event type and every consumer combined,
 * which made a plain BullMQ `Worker` a *competing-consumers* primitive — a
 * given job was delivered to exactly one `Worker` instance across every
 * process listening on that queue name, never to all of them. As of E16 T1,
 * `packages/events` fans every published event out to one real,
 * separately-named queue per registered consumer
 * (`domainEventsQueueName(consumer)` -> `domain-events-<consumer>`) at
 * publish time, so this module now listens on its own
 * `domain-events-recommendation-engine` queue — a second real consumer
 * (`notification-service`, E16 T2) gets its own queue and sees every event
 * independently, with no risk of silently splitting jobs between them.
 *
 * The same fix closed the retry/backoff gap this module's doc comment used
 * to flag: `DomainEventPublisher.publish()` now calls `queue.add(type,
 * envelope, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } })`
 * for every consumer's queue, matching `EVENT_ARCHITECTURE.md` §5's
 * documented retry policy instead of silently relying on BullMQ's
 * fail-on-first-attempt default.
 */
@Module({
  imports: [LearningPlanModule],
  providers: [
    {
      provide: DOMAIN_EVENTS_REDIS_CONFIG,
      useFactory: (): RedisEnv => loadConfig(redisEnvSchema),
    },
    DomainEventDispatcher,
  ],
})
export class DomainEventsModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainEventsModule.name);
  private worker: Worker | undefined;

  constructor(
    @Inject(DOMAIN_EVENTS_REDIS_CONFIG) private readonly redisConfig: RedisEnv,
    private readonly dispatcher: DomainEventDispatcher,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(
      domainEventsQueueName('recommendation-engine'),
      async (job: Job<DomainEvent>) => {
        await this.dispatcher.dispatch(job.name, job.data);
      },
      { connection: { url: this.redisConfig.REDIS_URL } },
    );
    // Real bug found while building `app.e2e-spec.ts`'s own e2e suite
    // (E16 T1) — see `DailyGoalModule`'s own identical fix/doc comment for
    // the full explanation: a `Worker` still mid-handshake when a fast
    // test calls `.close()` right after `app.init()` can reject an
    // in-flight command with "Connection is closed" as an unhandled
    // rejection, not something the `'error'` listener below catches.
    await this.worker.waitUntilReady();

    // Only fires once BullMQ's own attempt count is exhausted (today,
    // effectively "on the first failure" — see this module's own doc
    // comment on the missing retry/backoff configuration) — the same
    // "monitored failure hook" precedent `PartitionMaintenanceModule`
    // already set, so a missed event is visible (OBSERVABILITY.md
    // alerting), not silent.
    this.worker.on('failed', (job: Job<DomainEvent> | undefined, err: Error) => {
      this.logger.error(
        `Domain event processing failed (job ${job?.id}, type ${job?.name}): ${err.message}`,
      );
    });

    // Real, previously-latent bug found while building this module's own
    // e2e tests (E7 T3): `Worker` is an `EventEmitter` — a connection-level
    // error (e.g. a close/reconnect race during shutdown) with no
    // `'error'` listener registered throws unhandled in Node, crashing
    // the process rather than logging. `PartitionMaintenanceModule`
    // (ai-engine, E5 T11) carries this same latent gap — never triggered
    // there because no prior e2e test exercised a real Worker's full
    // startup-processing-shutdown lifecycle the way this task's own e2e
    // suite does. Logged, not silently swallowed.
    this.worker.on('error', (err: Error) => {
      this.logger.error(`Domain events Worker connection error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
