import { Inject, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { loadConfig, redisEnvSchema, type RedisEnv } from '@linguaai/config';
import { Queue, Worker, type Job } from 'bullmq';

import { DatabaseModule } from '../database/database.module.js';
import {
  PARTITION_MAINTENANCE_BACKOFF_MS,
  PARTITION_MAINTENANCE_CRON,
  PARTITION_MAINTENANCE_JOB_ATTEMPTS,
  PARTITION_MAINTENANCE_JOB_ID,
  PARTITION_MAINTENANCE_JOB_NAME,
  PARTITION_MAINTENANCE_QUEUE_NAME,
} from './partition-maintenance.constants.js';
import { createPartitionMaintenanceQueue } from './partition-maintenance.queue.js';
import { PartitionMaintenanceService } from './partition-maintenance.service.js';

export const PARTITION_MAINTENANCE_QUEUE = Symbol('PARTITION_MAINTENANCE_QUEUE');
const PARTITION_MAINTENANCE_REDIS_CONFIG = Symbol('PARTITION_MAINTENANCE_REDIS_CONFIG');

/**
 * ADR-035 (E4 R-69): the first real BullMQ *consumer* (Worker) in this
 * repository — `packages/events`/`apps/api`'s `EventsModule` established
 * the producer-side `Queue` pattern this module's own `Queue` factory
 * mirrors exactly, but nothing has ever run a `Worker` against a queue
 * before this. Registers one repeatable job (daily, `PARTITION_MAINTENANCE_CRON`)
 * on module init — idempotent across restarts via a stable `jobId`, so a
 * redeploy never creates a second, duplicate schedule — and starts a
 * `Worker` that invokes `PartitionMaintenanceService.runMaintenance()` per
 * job.
 *
 * Deliberately lives inside `ai-engine` (§6.5, ADR-035's own "Consequences"):
 * relocatable to a future shared "platform jobs" service (module 30) if one
 * emerges, not entangled with any `ai-engine`-specific state — this
 * module's only dependency is `DatabaseModule` (for `AI_ENGINE_PRISMA_CLIENT`,
 * itself already `app_role`-scoped per ADR-036) and a Redis URL.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: PARTITION_MAINTENANCE_REDIS_CONFIG,
      useFactory: (): RedisEnv => loadConfig(redisEnvSchema),
    },
    {
      provide: PARTITION_MAINTENANCE_QUEUE,
      useFactory: (config: RedisEnv): Queue => createPartitionMaintenanceQueue(config.REDIS_URL),
      inject: [PARTITION_MAINTENANCE_REDIS_CONFIG],
    },
    PartitionMaintenanceService,
  ],
})
export class PartitionMaintenanceModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PartitionMaintenanceModule.name);
  private worker: Worker | undefined;

  constructor(
    @Inject(PARTITION_MAINTENANCE_QUEUE) private readonly queue: Queue,
    @Inject(PARTITION_MAINTENANCE_REDIS_CONFIG) private readonly redisConfig: RedisEnv,
    private readonly partitionMaintenanceService: PartitionMaintenanceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      PARTITION_MAINTENANCE_JOB_NAME,
      {},
      {
        jobId: PARTITION_MAINTENANCE_JOB_ID,
        repeat: { pattern: PARTITION_MAINTENANCE_CRON },
        attempts: PARTITION_MAINTENANCE_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: PARTITION_MAINTENANCE_BACKOFF_MS },
      },
    );

    this.worker = new Worker(
      PARTITION_MAINTENANCE_QUEUE_NAME,
      async () => {
        await this.partitionMaintenanceService.runMaintenance();
      },
      { connection: { url: this.redisConfig.REDIS_URL } },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.log(`Partition maintenance run completed (job ${job.id})`);
    });
    // Only fires once BullMQ's own attempts/backoff are exhausted
    // (PARTITION_MAINTENANCE_JOB_ATTEMPTS) — the "monitored failure hook"
    // ADR-035 requires, so a missed run is visible (OBSERVABILITY.md
    // alerting), not silent. No paging provider is integrated directly by
    // this module — same honestly-scoped "structured log, real paging
    // integration is a separate concern" precedent T9's circuit breaker
    // already set.
    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(
        `Partition maintenance run failed after all retry attempts (job ${job?.id}): ${err.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
