import type { ActivityType, Skill } from '@linguaai/database';

/**
 * E7 design doc §3.3/§6.4 — `content.prisma`'s `Exercise` carries no
 * `skill` field of its own; the closest available signal is
 * `Activity.type` (`ActivityType`), a *different*, independently-defined
 * enum from `Skill` (`ProficiencyLevel`/`AssessmentItem`'s own). They
 * don't line up 1:1 — `CONVERSATION` has no `Skill` equivalent at all and
 * is deliberately omitted here, excluded from per-skill weakness scoring
 * rather than silently miscounted against one.
 */
export const ACTIVITY_TYPE_TO_SKILL: Partial<Record<ActivityType, Skill>> = {
  VOCABULARY_DRILL: 'VOCABULARY',
  GRAMMAR_EXPLANATION: 'GRAMMAR',
  LISTENING: 'LISTENING',
  SPEAKING: 'SPEAKING',
  READING: 'READING',
  WRITING: 'WRITING',
};

/** At least this many `ProficiencyLevelHistory` entries for a skill are needed before a trend (regressed/no-improvement) can be judged at all — a single entry has nothing to compare against. */
export const MIN_HISTORY_ENTRIES_FOR_TREND = 2;

/** At least this many recent `ExerciseAttempt` rows for a skill are needed before accuracy is judged — avoids flagging a skill weak off a single unlucky attempt. Provisional, the same honesty class as every other un-derived numeric parameter this platform ships (e.g. ADR-034's cost thresholds, E6's `CONFIDENCE_FLOOR`). */
export const MIN_RECENT_EXERCISE_ATTEMPTS_FOR_SIGNAL = 3;

/** Below this fraction-correct, a skill is flagged weak on the accuracy signal. Provisional. */
export const WEAK_ACCURACY_THRESHOLD = 0.6;

/** How many of a user's most recent `ExerciseAttempt` rows (across all skills, for the plan's own language) are fetched to compute the accuracy signal from. */
export const RECENT_EXERCISE_ATTEMPTS_LIMIT = 20;
