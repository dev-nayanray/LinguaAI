import { Inject, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { loadConfig, redisEnvSchema, type RedisEnv } from '@linguaai/config';
import { createDomainEventsQueue, DomainEventPublisher } from '@linguaai/events';
import { Queue, Worker, type Job } from 'bullmq';

import { WeaknessDetectionModule } from '../weakness-detection/weakness-detection.module.js';
import { DailyGoalBatchRunner } from './daily-goal-batch-runner.service.js';
import {
  DAILY_GOAL_BACKOFF_MS,
  DAILY_GOAL_CRON,
  DAILY_GOAL_JOB_ATTEMPTS,
  DAILY_GOAL_JOB_ID,
  DAILY_GOAL_JOB_NAME,
  DAILY_GOAL_QUEUE_NAME,
  DOMAIN_EVENT_PUBLISHER,
} from './daily-goal.constants.js';
import { DailyGoalService } from './daily-goal.service.js';
import { createDailyGoalQueue } from './daily-goal.queue.js';

export const DAILY_GOAL_QUEUE = Symbol('DAILY_GOAL_QUEUE');
const DAILY_GOAL_REDIS_CONFIG = Symbol('DAILY_GOAL_REDIS_CONFIG');
/** The raw `Queue` backing `DOMAIN_EVENT_PUBLISHER` (§6.5) — kept as its own token only so `onModuleDestroy` can close it; nothing else injects this directly. */
const DOMAIN_EVENTS_PUBLISH_QUEUE = Symbol('DOMAIN_EVENTS_PUBLISH_QUEUE');

/**
 * E7 T3, §6.3 — mirrors `ai-engine`'s own `PartitionMaintenanceModule`
 * (ADR-035) exactly: one repeatable job (daily) registered on module
 * init, idempotent across restarts via a stable `jobId`, and a `Worker`
 * that runs the real batch (`DailyGoalBatchRunner`) per job. The real
 * batch/per-plan logic lives outside this file on purpose — `*.module.ts`
 * files are exempt from this repo's coverage requirement, matching
 * `DomainEventsModule`'s own T2 precedent.
 */
@Module({
  imports: [WeaknessDetectionModule],
  providers: [
    { provide: DAILY_GOAL_REDIS_CONFIG, useFactory: (): RedisEnv => loadConfig(redisEnvSchema) },
    {
      provide: DAILY_GOAL_QUEUE,
      useFactory: (config: RedisEnv): Queue => createDailyGoalQueue(config.REDIS_URL),
      inject: [DAILY_GOAL_REDIS_CONFIG],
    },
    {
      provide: DOMAIN_EVENTS_PUBLISH_QUEUE,
      useFactory: (config: RedisEnv): Queue => createDomainEventsQueue(config.REDIS_URL),
      inject: [DAILY_GOAL_REDIS_CONFIG],
    },
    {
      // §6.5 — `recommendation-engine`'s first real domain-event *producer*
      // (T2's `DomainEventsModule` is a consumer only). `producedBy` is
      // passed explicitly as `'services/recommendation-engine'`, matching
      // `EVENT_ARCHITECTURE.md` §3's Producer column convention — see
      // `packages/events/domain-event.ts`'s own doc comment for the real
      // hardcoded-default bug this call site's own existence found and fixed.
      provide: DOMAIN_EVENT_PUBLISHER,
      useFactory: (queue: Queue): DomainEventPublisher =>
        new DomainEventPublisher(queue, 'services/recommendation-engine'),
      inject: [DOMAIN_EVENTS_PUBLISH_QUEUE],
    },
    DailyGoalService,
    DailyGoalBatchRunner,
  ],
})
export class DailyGoalModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyGoalModule.name);
  private worker: Worker | undefined;

  constructor(
    @Inject(DAILY_GOAL_QUEUE) private readonly queue: Queue,
    @Inject(DOMAIN_EVENTS_PUBLISH_QUEUE) private readonly domainEventsQueue: Queue,
    @Inject(DAILY_GOAL_REDIS_CONFIG) private readonly redisConfig: RedisEnv,
    private readonly batchRunner: DailyGoalBatchRunner,
  ) {}

  async onModuleInit(): Promise<void> {
    // Same real fix as the Worker's own `'error'` listener below — `Queue`
    // is an `EventEmitter` too, and this module holds live `Queue`
    // references of its own (unlike `DomainEventsModule`, which only ever
    // holds a `Worker`).
    this.queue.on('error', (err: Error) => {
      this.logger.error(`DailyGoal Queue connection error: ${err.message}`);
    });
    this.domainEventsQueue.on('error', (err: Error) => {
      this.logger.error(`DailyGoal domain-events publish Queue connection error: ${err.message}`);
    });

    await this.queue.add(
      DAILY_GOAL_JOB_NAME,
      {},
      {
        jobId: DAILY_GOAL_JOB_ID,
        repeat: { pattern: DAILY_GOAL_CRON },
        attempts: DAILY_GOAL_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: DAILY_GOAL_BACKOFF_MS },
      },
    );

    this.worker = new Worker(
      DAILY_GOAL_QUEUE_NAME,
      async () => {
        await this.batchRunner.run();
      },
      { connection: { url: this.redisConfig.REDIS_URL } },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.log(`DailyGoal generation run completed (job ${job.id})`);
    });
    // Only fires once BullMQ's own attempts/backoff are exhausted — the
    // "monitored failure hook" precedent `PartitionMaintenanceModule`
    // already set, so a fully-failed run is visible (OBSERVABILITY.md
    // alerting), distinct from `DailyGoalBatchRunner`'s own per-plan
    // logging (a single plan failing does not fail the job itself).
    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(
        `DailyGoal generation run failed after all retry attempts (job ${job?.id}): ${err.message}`,
      );
    });

    // Real, previously-latent bug found while building this module's own
    // e2e test (E7 T3) — see `DomainEventsModule`'s own identical fix and
    // doc comment for the full explanation (`Worker` is an `EventEmitter`;
    // an unlistened `'error'` event throws unhandled in Node).
    this.worker.on('error', (err: Error) => {
      this.logger.error(`DailyGoal Worker connection error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.domainEventsQueue.close();
  }
}
