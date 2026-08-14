import { Inject, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { loadConfig, redisEnvSchema, type RedisEnv } from '@linguaai/config';
import { domainEventsQueueName, type DomainEvent } from '@linguaai/events';
import { Worker, type Job } from 'bullmq';

import { AnalyticsModule } from '../analytics/analytics.module.js';
import { AnalyticsEventDispatcher } from '../analytics/analytics-event-dispatcher.service.js';

const DOMAIN_EVENTS_REDIS_CONFIG = Symbol('DOMAIN_EVENTS_REDIS_CONFIG');

/**
 * `analytics-service`'s own event consumer (E17 T1) — the platform's
 * third real consumer, now safely registered against its own
 * separately-named queue (`domain-events-analytics-service`, E16 T1's
 * per-consumer fan-out — exactly the extension point that design already
 * reserved). Mirrors `recommendation-engine`'s/`notification-service`'s
 * own `DomainEventsModule` structurally exactly (`Worker` construction/
 * lifecycle, `'failed'`/`'error'` listeners, `waitUntilReady()` before
 * `onModuleInit` resolves — E16 T1's own real fix). Unlike both of those,
 * this consumer has no `jobName` switch at all — `AnalyticsEventDispatcher`
 * handles every event type uniformly (design doc §3.2). `*.module.ts`
 * files are exempt from this repo's coverage requirement — this file is
 * wiring only.
 */
@Module({
  imports: [AnalyticsModule],
  providers: [
    {
      provide: DOMAIN_EVENTS_REDIS_CONFIG,
      useFactory: (): RedisEnv => loadConfig(redisEnvSchema),
    },
  ],
})
export class DomainEventsModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainEventsModule.name);
  private worker: Worker | undefined;

  constructor(
    @Inject(DOMAIN_EVENTS_REDIS_CONFIG) private readonly redisConfig: RedisEnv,
    private readonly dispatcher: AnalyticsEventDispatcher,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(
      domainEventsQueueName('analytics-service'),
      async (job: Job<DomainEvent>) => {
        await this.dispatcher.dispatch(job.name, job.data);
      },
      { connection: { url: this.redisConfig.REDIS_URL } },
    );
    // E16 T1's own real fix — a `Worker` still mid-handshake when a fast
    // test calls `.close()` right after `app.init()` can reject an
    // in-flight command with "Connection is closed" as an unhandled
    // rejection; see `DailyGoalModule`'s own identical fix/doc comment.
    await this.worker.waitUntilReady();

    this.worker.on('failed', (job: Job<DomainEvent> | undefined, err: Error) => {
      this.logger.error(
        `Analytics event processing failed (job ${job?.id}, type ${job?.name}): ${err.message}`,
      );
    });

    // `Worker` is an `EventEmitter` — an unlistened `'error'` event throws
    // unhandled in Node, the same real, previously-latent bug
    // `recommendation-engine`'s own `DomainEventsModule` doc comment
    // explains.
    this.worker.on('error', (err: Error) => {
      this.logger.error(`Analytics events Worker connection error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
