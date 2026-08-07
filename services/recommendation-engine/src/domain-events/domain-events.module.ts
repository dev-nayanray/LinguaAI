import { Inject, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { loadConfig, redisEnvSchema, type RedisEnv } from '@linguaai/config';
import { DOMAIN_EVENTS_QUEUE_NAME, type DomainEvent } from '@linguaai/events';
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
 * **Real, flagged architectural gap, not silently worked around
 * (RISK_REGISTER — added in this same task):** `domain-events` is one
 * shared BullMQ queue for every event type and every consumer combined. A
 * plain BullMQ `Worker` is a *competing-consumers* primitive — a given job
 * is delivered to exactly one `Worker` instance across every process
 * listening on that queue name, never to all of them. `EVENT_ARCHITECTURE.md`
 * §1's own claim ("any number of consumers subscribe independently") does
 * not actually hold for the current single-queue implementation the moment
 * a *second* real consumer (e.g. `analytics-service`, already named in the
 * catalog for this very event) starts its own `Worker` on this same queue
 * — the two would silently split events between them instead of each
 * seeing every one. Safe today only because this is the platform's first
 * and only real consumer; not safe the instant a second one ships. The
 * recommended real fix (per-consumer queue fan-out inside `packages/events`
 * itself, at publish time) is named in the risk-register entry for whoever
 * builds that second consumer — deliberately not built speculatively here,
 * since a fan-out mechanism with only one real subscriber to fan out to is
 * unverifiable and premature.
 *
 * This same gap extends to retry/backoff: `EVENT_ARCHITECTURE.md` §5
 * states events "retry with exponential backoff" — but
 * `DomainEventPublisher.publish()` calls `queue.add(type, envelope)` with
 * no `attempts`/`backoff` options at all, so a job that throws today fails
 * permanently on the first attempt (BullMQ's own default), not after a
 * documented retry policy. Also flagged in the same risk-register entry,
 * not fixed here — a producer-side `packages/events` change, outside this
 * consumer-side task's own scope.
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
      DOMAIN_EVENTS_QUEUE_NAME,
      async (job: Job<DomainEvent>) => {
        await this.dispatcher.dispatch(job.name, job.data);
      },
      { connection: { url: this.redisConfig.REDIS_URL } },
    );

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
