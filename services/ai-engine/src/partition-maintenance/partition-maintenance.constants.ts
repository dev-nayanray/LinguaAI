export const PARTITION_MAINTENANCE_QUEUE_NAME = 'partition-maintenance';
export const PARTITION_MAINTENANCE_JOB_NAME = 'run-maintenance';

/**
 * ADR-035: daily cadence. No doc specifies a time-of-day — 3am UTC is a
 * provisional, plausibly-low-traffic-hours choice, flagged as not derived
 * from any source, the same honesty precedent as this epic's other
 * un-derived numeric parameters (ADR-034's thresholds, T4's rolling-summary
 * trigger count).
 */
export const PARTITION_MAINTENANCE_CRON = '0 3 * * *';

/** A stable jobId so re-registering the repeatable job on every app restart is idempotent — BullMQ dedupes a repeatable job by (name, jobId, repeat options), it does not create a second schedule on a redundant `queue.add()` call. */
export const PARTITION_MAINTENANCE_JOB_ID = 'partition-maintenance-daily';

/** EVENT_ARCHITECTURE.md §5: "retries with exponential backoff... then moves to a dead-letter queue" — BullMQ's own `attempts`/`backoff` options are that retry mechanism; a job that exhausts all attempts lands in BullMQ's `failed` state (this queue's own dead-letter, queryable via `queue.getFailed()`), not a separate DLQ construct. */
export const PARTITION_MAINTENANCE_JOB_ATTEMPTS = 3;
export const PARTITION_MAINTENANCE_BACKOFF_MS = 60_000;
