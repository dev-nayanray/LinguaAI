import { Queue } from 'bullmq';

import { PARTITION_MAINTENANCE_QUEUE_NAME } from './partition-maintenance.constants.js';

/** Mirrors `packages/events`'s own `createDomainEventsQueue` exactly (ADR-035) — the one place a `Queue` gets constructed, so connection options never drift between call sites. A dedicated queue/connection, not shared with `RedisModule`'s (T9) `AI_ENGINE_REDIS` client — that connection is tuned fail-fast for the cost circuit breaker's hot path (`maxRetriesPerRequest: 1`, `enableOfflineQueue: false`), incompatible with BullMQ's own connection requirements for blocking commands. */
export function createPartitionMaintenanceQueue(redisUrl: string): Queue {
  return new Queue(PARTITION_MAINTENANCE_QUEUE_NAME, { connection: { url: redisUrl } });
}
