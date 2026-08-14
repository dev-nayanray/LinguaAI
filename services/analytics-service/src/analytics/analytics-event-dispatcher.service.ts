import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@linguaai/database';
import type { DomainEvent } from '@linguaai/events';

import { ANALYTICS_SERVICE_PRISMA_CLIENT } from '../database/database.config.js';

/**
 * `analytics-service`'s own real event consumer (E17 T1) — unlike
 * `recommendation-engine`'s `DomainEventDispatcher`/`notification-service`'s
 * `NotificationDispatcher`, this one is deliberately generic, not a
 * `jobName` switch (design doc §3.2): `LearningEvent` is "the persisted
 * form of the domain events cataloged in EVENT_ARCHITECTURE.md"
 * (DATABASE.md §2.10), so every real, cataloged event type is handled
 * uniformly — validate the envelope's own fixed fields, check-and-insert.
 * `payload` itself stays opaque `Json`, matching the table's own schema;
 * this consumer never interprets event-specific payload shape.
 *
 * **Real, best-effort idempotency (design doc §3.1):** `EVENT_ARCHITECTURE.md`
 * §4 claims "every consumer stores processed eventIds and no-ops on a
 * duplicate delivery" — true for real here, unlike the two existing
 * consumers (confirmed via direct inspection: neither implements any such
 * check). `LearningEvent.eventId` is deliberately not a unique constraint
 * (DATABASE.md §2.10's own documented reason: a partitioned table's unique
 * constraints must include the partition column, so no constraint on
 * `eventId` alone can span partitions) — this dispatcher does a real
 * existence check before inserting instead, closing the common case
 * (BullMQ's own retry-on-transient-failure redelivery) without claiming a
 * cross-partition uniqueness guarantee the schema itself cannot provide.
 * A real, narrow race window remains under concurrent redelivery of the
 * same `eventId` — flagged honestly (RISK_REGISTER), not hidden.
 */
@Injectable()
export class AnalyticsEventDispatcher {
  private readonly logger = new Logger(AnalyticsEventDispatcher.name);

  constructor(@Inject(ANALYTICS_SERVICE_PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async dispatch(jobName: string, event: DomainEvent): Promise<void> {
    const existing = await this.prisma.learningEvent.findFirst({
      where: { eventId: event.eventId },
      select: { id: true },
    });
    if (existing) {
      this.logger.debug(`Duplicate delivery of event ${event.eventId} (type ${jobName}) — no-op`);
      return;
    }

    await this.prisma.learningEvent.create({
      data: {
        eventId: event.eventId,
        type: event.type,
        version: event.version,
        occurredAt: new Date(event.occurredAt),
        producedBy: event.producedBy,
        userId: event.userId,
        payload: event.payload as Prisma.InputJsonValue,
      },
    });
  }
}
