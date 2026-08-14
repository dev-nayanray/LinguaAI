import { Inject, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { loadConfig, redisEnvSchema, type RedisEnv } from '@linguaai/config';
import { domainEventsQueueName, type DomainEvent } from '@linguaai/events';
import { Worker, type Job } from 'bullmq';

import { NotificationModule } from '../notification/notification.module.js';
import { NotificationDispatcher } from '../notification/notification-dispatcher.service.js';

const DOMAIN_EVENTS_REDIS_CONFIG = Symbol('DOMAIN_EVENTS_REDIS_CONFIG');

/**
 * `notification-service`'s own event consumer (E16 T2) — the second real
 * consumer RISK_REGISTER R-89 named, now safely registered against its own
 * separately-named queue (`domain-events-notification-service`, E16 T1's
 * per-consumer fan-out). Mirrors `recommendation-engine`'s own
 * `DomainEventsModule` structurally exactly (`Worker` construction/
 * lifecycle, `'failed'`/`'error'` listeners, `waitUntilReady()` before
 * `onModuleInit` resolves — the real fix E16 T1 found and applied there).
 * The real dispatch/filtering logic lives in `NotificationDispatcher`, not
 * here — this file is wiring only (`*.module.ts` files are exempt from
 * this repo's coverage requirement).
 */
@Module({
  imports: [NotificationModule],
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
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(
      domainEventsQueueName('notification-service'),
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
        `Notification event processing failed (job ${job?.id}, type ${job?.name}): ${err.message}`,
      );
    });

    // `Worker` is an `EventEmitter` — an unlistened `'error'` event throws
    // unhandled in Node, the same real, previously-latent bug
    // `recommendation-engine`'s own `DomainEventsModule` doc comment
    // explains.
    this.worker.on('error', (err: Error) => {
      this.logger.error(`Notification events Worker connection error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
