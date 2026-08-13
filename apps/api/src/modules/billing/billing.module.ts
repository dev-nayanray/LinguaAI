import { Inject, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { loadConfig, redisEnvSchema, type RedisEnv } from '@linguaai/config';
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';

import { AuthModule } from '../auth/index.js';
import { BILLING_CONFIG, resolveBillingConfig } from './billing.config.js';
import { BILLING_REDIS } from './billing-redis.token.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { EntitlementCacheService } from './entitlement-cache.service.js';
import { EntitlementGuard } from './entitlement.guard.js';
import {
  RECONCILIATION_BACKOFF_MS,
  RECONCILIATION_CRON,
  RECONCILIATION_JOB_ATTEMPTS,
  RECONCILIATION_JOB_ID,
  RECONCILIATION_JOB_NAME,
  RECONCILIATION_QUEUE_NAME,
} from './reconciliation.constants.js';
import { createReconciliationQueue } from './reconciliation.queue.js';
import { ReconciliationRunner } from './reconciliation-runner.service.js';
import { StripeClientService } from './stripe-client.service.js';

const BILLING_REDIS_CONFIG = Symbol('BILLING_REDIS_CONFIG');
export const RECONCILIATION_QUEUE = Symbol('RECONCILIATION_QUEUE');

/**
 * `BillingModule` (E15 T1-T3). `AuthModule` is imported only for
 * `AuthGuard('jwt')`'s own strategy provider, the same pattern every other
 * learner-facing module (Gamification, Pronunciation, ...) already
 * follows. `EntitlementGuard` is exported (not just `BillingService`) so
 * other feature modules (`PronunciationModule`, T2) can import
 * `BillingModule` and use `@RequireEntitlement(...)` on their own
 * controllers without duplicating entitlement-resolution logic.
 *
 * T3 adds two real pieces: `EntitlementCacheService`'s own dedicated
 * `ioredis` connection (`BILLING_REDIS` — separate from
 * `RateLimitModule`'s own connection, the same "different concern,
 * different tuning" reasoning `rate-limit.module.ts`'s own doc comment
 * already established; this one is deliberately fail-open, not
 * fail-closed, so no `await`-until-`'ready'` handshake is needed the way
 * `RATE_LIMIT_REDIS` requires), and a BullMQ repeatable reconciliation
 * job (`RECONCILIATION_QUEUE`) — mirrors
 * `services/recommendation-engine`'s own `DailyGoalModule` exactly (one
 * repeatable job registered on init, idempotent across restarts via a
 * stable `jobId`, a `Worker` running the real batch
 * `ReconciliationRunner`), per ARCHITECTURE.md §7's own explicit
 * "scheduled/cron jobs use BullMQ's repeatable-job feature" convention.
 */
@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [
    { provide: BILLING_CONFIG, useFactory: () => resolveBillingConfig() },
    { provide: BILLING_REDIS_CONFIG, useFactory: (): RedisEnv => loadConfig(redisEnvSchema) },
    {
      provide: BILLING_REDIS,
      useFactory: (config: RedisEnv): Redis => new Redis(config.REDIS_URL),
      inject: [BILLING_REDIS_CONFIG],
    },
    {
      provide: RECONCILIATION_QUEUE,
      useFactory: (config: RedisEnv): Queue => createReconciliationQueue(config.REDIS_URL),
      inject: [BILLING_REDIS_CONFIG],
    },
    StripeClientService,
    EntitlementCacheService,
    BillingService,
    EntitlementGuard,
    ReconciliationRunner,
  ],
  exports: [BillingService, EntitlementGuard],
})
export class BillingModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingModule.name);
  private worker: Worker | undefined;

  constructor(
    @Inject(RECONCILIATION_QUEUE) private readonly queue: Queue,
    @Inject(BILLING_REDIS_CONFIG) private readonly redisConfig: RedisEnv,
    @Inject(BILLING_REDIS) private readonly redis: Redis,
    private readonly runner: ReconciliationRunner,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue.on('error', (err: Error) => {
      this.logger.error(`Billing reconciliation Queue connection error: ${err.message}`);
    });
    this.redis.on('error', (err: Error) => {
      this.logger.error(`Billing entitlement-cache Redis connection error: ${err.message}`);
    });

    await this.queue.add(
      RECONCILIATION_JOB_NAME,
      {},
      {
        jobId: RECONCILIATION_JOB_ID,
        repeat: { pattern: RECONCILIATION_CRON },
        attempts: RECONCILIATION_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: RECONCILIATION_BACKOFF_MS },
      },
    );

    this.worker = new Worker(
      RECONCILIATION_QUEUE_NAME,
      async () => {
        await this.runner.run();
      },
      { connection: { url: this.redisConfig.REDIS_URL } },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.log(`Billing reconciliation run completed (job ${job.id})`);
    });
    // Only fires once BullMQ's own attempts/backoff are exhausted -- the
    // same "monitored failure hook" precedent `PartitionMaintenanceModule`/
    // `DailyGoalModule` already established.
    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(
        `Billing reconciliation run failed after all retry attempts (job ${job?.id}): ${err.message}`,
      );
    });
    this.worker.on('error', (err: Error) => {
      this.logger.error(`Billing reconciliation Worker connection error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    this.redis.disconnect();
  }
}
