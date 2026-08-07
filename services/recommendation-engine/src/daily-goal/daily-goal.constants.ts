/**
 * E7 design doc §6.3 — base targets before any adjustment, and the
 * completion-history/weak-skill adjustments applied to them. Provisional,
 * un-derived numeric parameters (the same honesty class as ADR-034's cost
 * thresholds, E6's `CONFIDENCE_FLOOR`) — no document specifies concrete
 * values, so these are real, documented choices made here, not silently
 * invented.
 */
export const BASE_TARGET_XP = 50;
export const BASE_TARGET_MINUTES = 15;
export const BASE_TARGET_ACTIVITIES = 3;

/** How many of the user's most recent `DailyGoal` rows are looked at for the "did they hit or miss their last N goals" adjustment (§6.3). */
export const RECENT_DAILY_GOALS_FOR_ADJUSTMENT = 3;

/**
 * At or above this completion rate over the recent window, targets scale
 * up. Chosen (0.6, not e.g. 2/3's own repeating decimal) so that with
 * `RECENT_DAILY_GOALS_FOR_ADJUSTMENT`'s own sample size of 3, "hit 2 of
 * the last 3" (≈0.667) reliably clears it without floating-point
 * boundary precision mattering.
 */
export const HIGH_COMPLETION_THRESHOLD = 0.6;
/** At or below this completion rate, targets scale down — "hit 1 of the last 3" (≈0.333) reliably falls below it, the same boundary-precision reasoning as the high threshold above. Between the two thresholds, targets stay at the base multiplier (1). */
export const LOW_COMPLETION_THRESHOLD = 0.4;

export const HIGH_COMPLETION_MULTIPLIER = 1.1;
export const LOW_COMPLETION_MULTIPLIER = 0.9;
export const BASE_MULTIPLIER = 1;

/** Extra target activities added when at least one skill is currently flagged weak (§6.4) — a small nudge toward more practice, not a second, independently-tuned target system. */
export const WEAK_SKILL_ACTIVITY_BONUS = 1;

export const DAILY_GOAL_QUEUE_NAME = 'daily-goal-generation';
export const DAILY_GOAL_JOB_NAME = 'generate-daily-goals';
export const DAILY_GOAL_JOB_ID = 'daily-goal-generation-repeatable';
/** Provisional, matching ADR-035's own partition-maintenance schedule choice exactly (early morning UTC) — a different queue/service, no actual collision risk, just the same "run once daily, off-peak" reasoning. */
export const DAILY_GOAL_CRON = '0 3 * * *';
export const DAILY_GOAL_JOB_ATTEMPTS = 3;
export const DAILY_GOAL_BACKOFF_MS = 5000;
