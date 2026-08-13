import { Queue } from 'bullmq';

import { RECONCILIATION_QUEUE_NAME } from './reconciliation.constants.js';

/** Mirrors `daily-goal.queue.ts`'s own `createDailyGoalQueue` exactly — a dedicated queue/connection, separate from `EventsModule`'s own domain-events consumer connection (a self-scheduled job producer and an externally-driven event consumer have no reason to share one). */
export function createReconciliationQueue(redisUrl: string): Queue {
  return new Queue(RECONCILIATION_QUEUE_NAME, { connection: { url: redisUrl } });
}
