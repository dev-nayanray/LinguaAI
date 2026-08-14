/**
 * Domain-event envelope + transport (E2-T20, real per-consumer fan-out
 * since E16 T1/ADR-055). Follows EVENT_ARCHITECTURE.md §1/§2 — "ride on
 * the same Redis infrastructure already used for BullMQ... no new
 * infrastructure is introduced" and the fixed envelope shape
 * (`eventId`/`type`/`version`/`occurredAt`/`producedBy`/`tenantId`/
 * `userId`/`payload`).
 *
 * Lives in its own package (not `apps/api`-local) because it has multiple
 * real producers that don't share a runtime: `apps/api`'s NestJS
 * application (most events), `services/recommendation-engine` (E7 T4),
 * and `packages/database/scripts/bootstrap-admin.ts` (Part 9A's
 * `identity.role.changed`/`identity.role.emergency_recovery`), which runs
 * entirely outside NestJS and, per ADR-015, cannot import from `apps/*`.
 * No `@Injectable()`/framework dependency here — only each app/service's
 * own `events.module.ts` (or `domain-events.module.ts`) is NestJS-specific,
 * a thin DI wrapper around what's defined here.
 *
 * **Real, closed architectural gap (RISK_REGISTER R-89, found at E7 T2,
 * closed here at E16 T1):** a single shared BullMQ queue for every event
 * type and every consumer combined is a competing-consumers primitive, not
 * a fan-out/broadcast one — `EVENT_ARCHITECTURE.md` §1's own claim ("any
 * number of consumers subscribe independently") did not actually hold
 * against a plain shared `Queue`/`Worker`: the moment a *second* real
 * consumer (`notification-service`, E16) started its own `Worker` on the
 * same queue name `recommendation-engine`'s own `DomainEventsModule`
 * already listens on, the two would have silently split events between
 * them instead of each seeing every one. Fixed via a small, explicit,
 * by-name consumer registry (`DOMAIN_EVENT_CONSUMERS`) — each real
 * consumer gets its own separately-named queue (`domain-events-<consumer>`),
 * and `DomainEventPublisher.publish()` fans the same envelope out to
 * every registered consumer's own queue in one call. Extending this list
 * by name (the same explicit, reviewable registration discipline
 * `EVENT_ARCHITECTURE.md`'s own catalog table already uses, not dynamic
 * service discovery) is how a future third consumer (`analytics-service`,
 * E17) joins safely — no other code changes required.
 *
 * The second R-89 sub-gap (`EVENT_ARCHITECTURE.md` §5's "retry with
 * exponential backoff" claim, previously unbacked by any real BullMQ
 * `attempts`/`backoff` option) is also closed here — every fan-out
 * `queue.add()` call now carries a real retry policy.
 */

import { randomUUID } from 'node:crypto';

import { Queue } from 'bullmq';

/**
 * The platform's real, registered domain-event consumers (E16 T1) — each
 * gets its own real, separately-named BullMQ queue. Adding a new consumer
 * here is the entire integration surface for a future service to safely
 * become a third/fourth/etc. real consumer of the same event stream.
 */
export const DOMAIN_EVENT_CONSUMERS = ['recommendation-engine', 'notification-service'] as const;
export type DomainEventConsumer = (typeof DOMAIN_EVENT_CONSUMERS)[number];

/**
 * `domain-events-<consumer>` — real per-consumer queue name (E16 T1,
 * closes RISK_REGISTER R-89). Hyphen-separated, not colon-separated — a
 * real, found BullMQ constraint (`Queue name cannot contain :`, colons
 * are reserved for BullMQ's own internal Redis key namespacing),
 * matching this codebase's own existing queue-name convention
 * (`daily-goal-generation`, `billing-reconciliation`).
 */
export function domainEventsQueueName(consumer: DomainEventConsumer): string {
  return `domain-events-${consumer}`;
}

/** Real retry policy (E16 T1) — closes R-89's own second sub-gap: `EVENT_ARCHITECTURE.md` §5 claims "retry with exponential backoff," previously unbacked by any actual `queue.add()` option. */
const PUBLISH_ATTEMPTS = 3;
const PUBLISH_BACKOFF_MS = 5000;

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
 * `producedBy` defaults to `'apps/api'` — every producer until E7 T4 really
 * was `apps/api` (EVENT_ARCHITECTURE.md §3's catalog lists every identity
 * event's producer this way, including `identity.role.changed`/
 * `identity.role.emergency_recovery` — Part 9A distinguishes the
 * bootstrap-CLI origin via the payload's own `changedBy: 'system-bootstrap'`
 * field, not a different envelope-level producer identity, a deliberate
 * choice that predates this constructor param and is left as-is).
 */
export class DomainEventPublisher {
  /** One real `Queue` per registered consumer (E16 T1's own fan-out fix) — never a single shared queue. */
  private readonly queues: readonly Queue[];

  constructor(
    queues: Queue | readonly Queue[],
    private readonly producedBy: string = 'apps/api',
  ) {
    this.queues = Array.isArray(queues) ? queues : [queues];
  }

  async publish<TPayload extends Record<string, unknown>>(
    type: string,
    params: PublishParams<TPayload>,
  ): Promise<void> {
    const envelope: DomainEvent<TPayload> = {
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: new Date().toISOString(),
      producedBy: this.producedBy,
      tenantId: params.tenantId ?? null,
      userId: params.userId,
      payload: params.payload,
    };
    await Promise.all(
      this.queues.map((queue) =>
        queue.add(type, envelope, {
          attempts: PUBLISH_ATTEMPTS,
          backoff: { type: 'exponential', delay: PUBLISH_BACKOFF_MS },
        }),
      ),
    );
  }
}

/**
 * Constructs one real `Queue` per registered consumer (E16 T1) — the one
 * place these get constructed, so connection options never drift between
 * producer call sites (`apps/api`'s `EventsModule`,
 * `recommendation-engine`'s `DailyGoalModule`, `bootstrap-admin.ts`).
 * Returns every consumer's own queue, keyed by consumer name, so a caller
 * can both hand the full list to `DomainEventPublisher` and close each by
 * name on shutdown.
 */
export function createDomainEventsQueues(redisUrl: string): Record<DomainEventConsumer, Queue> {
  const entries = DOMAIN_EVENT_CONSUMERS.map(
    (consumer) => [consumer, newQueue(redisUrl, consumer)] as const,
  );
  return Object.fromEntries(entries) as Record<DomainEventConsumer, Queue>;
}

/**
 * Constructs the real `Queue` a single named consumer's own `Worker`
 * listens on (E16 T1) — `recommendation-engine`'s `DomainEventsModule`/
 * a future `notification-service` consumer module each call this with
 * their own consumer name, never the old shared queue name.
 */
export function createDomainEventsConsumerQueue(
  redisUrl: string,
  consumer: DomainEventConsumer,
): Queue {
  return newQueue(redisUrl, consumer);
}

/**
 * `Queue` is an `EventEmitter` whose underlying ioredis connection can
 * emit `'error'` (e.g. a close/reconnect race) — a real, previously-latent
 * bug `DailyGoalModule`'s/`DomainEventsModule`'s own doc comments already
 * document for their own `Worker`s. With only one shared queue, callers
 * attached their own `'error'` listener during `onModuleInit`, a tick or
 * more after the `Queue` was actually constructed in a provider factory —
 * a gap where an early `'error'` could crash the process instead of being
 * logged. Attaching a default no-op handler here, in the same synchronous
 * tick as construction, closes that specific gap. (A related but distinct
 * bug — a `Queue`/`Worker` still mid-handshake when a fast test closes it
 * almost immediately rejects an in-flight *command* with "Connection is
 * closed," not an `'error'` event at all, so this listener alone cannot
 * catch it; every caller of these constructors awaits `.waitUntilReady()`
 * before returning from its own `onModuleInit` to close that window
 * instead — see `DailyGoalModule`/`DomainEventsModule`/`EventsModule`.)
 */
function newQueue(redisUrl: string, consumer: DomainEventConsumer): Queue {
  const queue = new Queue(domainEventsQueueName(consumer), { connection: { url: redisUrl } });
  queue.on('error', () => undefined);
  return queue;
}
