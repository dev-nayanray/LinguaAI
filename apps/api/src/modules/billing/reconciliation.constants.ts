export const RECONCILIATION_QUEUE_NAME = 'billing-reconciliation';
export const RECONCILIATION_JOB_NAME = 'reconcile-subscriptions';
export const RECONCILIATION_JOB_ID = 'billing-reconciliation-repeatable';
/**
 * Hourly (E15 T3, design doc §3.4) — billing correctness is more
 * time-sensitive than `recommendation-engine`'s own once-daily
 * `DAILY_GOAL_CRON`, so a tighter interval than daily is a real,
 * deliberate choice, not the same "once a day is fine" precedent copied
 * blindly. A real, found operational constraint kept this from being
 * more frequent still: `apps/api`'s own e2e test suite has ~27 spec
 * files that each boot a full, real `AppModule` (unlike
 * `recommendation-engine`'s own smaller, dedicated-service test
 * surface) — a real `BillingModule` instance, repeatable job, and Worker
 * spin up in *every one* of them, all sharing the same real Redis. A
 * shorter interval (originally a 15-minute cron pattern) measurably raised the
 * odds of the cron firing mid-suite and landing on an unrelated test
 * file's own app instance, whose `StripeClientService` isn't
 * necessarily stubbed the way this module's own e2e suite stubs it —
 * confirmed the hard way (`billing.e2e-spec.ts`'s own stub crashed with
 * "listRecentSubscriptions is not a function" when the job landed on
 * it). Hourly meaningfully lowers that collision probability against a
 * full suite run's own real wall-clock duration; RISK_REGISTER tracks
 * the residual risk honestly rather than treating this interval choice
 * as a full fix. Still a provisional, undocumented-elsewhere constant
 * (the same honesty class as `DAILY_GOAL_CRON`'s own header comment) —
 * a real production interval is a real operational tuning decision for
 * whoever owns on-call load, not this task's own scope to finalize
 * precisely.
 */
export const RECONCILIATION_CRON = '0 * * * *';
export const RECONCILIATION_JOB_ATTEMPTS = 3;
export const RECONCILIATION_BACKOFF_MS = 5000;
