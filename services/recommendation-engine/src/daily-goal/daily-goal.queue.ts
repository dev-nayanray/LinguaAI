import { Queue } from 'bullmq';

import { DAILY_GOAL_QUEUE_NAME } from './daily-goal.constants.js';

/** Mirrors `packages/events`'s own `createDomainEventsQueues`/`ai-engine`'s own `createPartitionMaintenanceQueue` exactly — the one place this `Queue` gets constructed. A dedicated queue/connection, separate from `DomainEventsModule`'s own consumer connection — a self-scheduled job producer and an externally-driven event consumer have no reason to share one. */
export function createDailyGoalQueue(redisUrl: string): Queue {
  return new Queue(DAILY_GOAL_QUEUE_NAME, { connection: { url: redisUrl } });
}
