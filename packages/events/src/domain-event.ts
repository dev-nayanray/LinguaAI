/**
 * Domain-event envelope + transport (E2-T20). Follows
 * EVENT_ARCHITECTURE.md §1/§2 exactly — "ride on the same Redis
 * infrastructure already used for BullMQ... no new infrastructure is
 * introduced" and the fixed envelope shape (`eventId`/`type`/`version`/
 * `occurredAt`/`producedBy`/`tenantId`/`userId`/`payload`). This is the
 * first real producer in the codebase — no consumer (`notification-service`/
 * `analytics-service`) exists yet to read this queue; publishing here is
 * still correct and required (Part 10's own producer-side acceptance
 * criteria), matching the same "durable artifact now, consumer later"
 * pattern already established for `AuditLog` throughout this Epic.
 *
 * Lives in its own package (not `apps/api`-local) because it has two real
 * producers that don't share a runtime: `apps/api`'s NestJS application
 * (most events) and `packages/database/scripts/bootstrap-admin.ts` (Part
 * 9A's `identity.role.changed`/`identity.role.emergency_recovery`), which
 * runs entirely outside NestJS and, per ADR-015, cannot import from
 * `apps/*`. No `@Injectable()`/framework dependency here — only
 * `apps/api/src/events/events.module.ts` is NestJS-specific, a thin DI
 * wrapper around what's defined here.
 */

import { randomUUID } from 'node:crypto';

import { Queue } from 'bullmq';

/** One shared queue for every domain event — consumers filter by `type`, matching EVENT_ARCHITECTURE.md §3's catalog table (one conceptual "event stream", not one queue per event type). */
export const DOMAIN_EVENTS_QUEUE_NAME = 'domain-events';

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string;
  type: string;
  version: number;
  occurredAt: string;
  producedBy: string;
  tenantId: string | null;
  userId: string | null;
  payload: TPayload;
}

export interface PublishParams<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  userId: string | null;
  tenantId?: string | null;
  payload: TPayload;
}

/**
 * `producedBy` is always `'apps/api'` (EVENT_ARCHITECTURE.md §3's catalog
 * lists every identity event's producer this way, including
 * `identity.role.changed`/`identity.role.emergency_recovery` — Part 9A
 * distinguishes the bootstrap-CLI origin via the payload's own `changedBy:
 * 'system-bootstrap'` field, not a different envelope-level producer
 * identity) — not configurable per call site.
 */
export class DomainEventPublisher {
  constructor(private readonly queue: Queue) {}

  async publish<TPayload extends Record<string, unknown>>(
    type: string,
    params: PublishParams<TPayload>,
  ): Promise<void> {
    const envelope: DomainEvent<TPayload> = {
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: new Date().toISOString(),
      producedBy: 'apps/api',
      tenantId: params.tenantId ?? null,
      userId: params.userId,
      payload: params.payload,
    };
    await this.queue.add(type, envelope);
  }
}

/** Shared by every producer — the one place a `Queue` gets constructed, so connection options never drift between call sites. */
export function createDomainEventsQueue(redisUrl: string): Queue {
  return new Queue(DOMAIN_EVENTS_QUEUE_NAME, { connection: { url: redisUrl } });
}
