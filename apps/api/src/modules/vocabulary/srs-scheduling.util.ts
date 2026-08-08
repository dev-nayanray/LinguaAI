/** SM-2's own standard minimum ease factor — below this, review intervals collapse toward daily regardless of continued success, defeating the algorithm's own purpose (design doc §6.3). */
const MINIMUM_EASE_FACTOR = 1.3;

/** SM-2's own standard interval-growth stages for the first two successful repetitions, before the ease-factor-multiplied stage takes over. */
const FIRST_REPETITION_INTERVAL_DAYS = 1;
const SECOND_REPETITION_INTERVAL_DAYS = 6;

/** A failed recall (`quality < 3`) always resets the interval to a single day, the classic SM-2 "start over" branch. */
const FAILED_RECALL_INTERVAL_DAYS = 1;

export interface SrsCardState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

/**
 * The SM-2-derivative scheduling algorithm, stated precisely (E9 T3, §6.3,
 * ADR-042) — the PRD's own literal "documented algorithm" acceptance bar
 * for this module. Pure and I/O-free, the same testability precedent
 * every other scoring/selection function in this codebase already follows
 * (`AdaptiveItemSelectionService`, `exercise-scoring.util.ts`,
 * `computeAdjustmentMultiplier`). Returns only the algorithm's own state
 * (`easeFactor`/`intervalDays`/`repetitions`) — converting `intervalDays`
 * into a real `nextReviewAt` timestamp, and stamping `lastReviewedAt`, are
 * the caller's own wall-clock concern (`SrsDeckService`), not this
 * function's, so no `Date` needs mocking to test it.
 *
 * `quality` is the standard SM-2 0-5 input scale — the literal algorithm's
 * own grading input, not a platform-invented simplification. These
 * constants (0.1/0.08/0.02, the 1.3 ease-factor floor, the 1-day/6-day
 * first two interval stages) are the published SM-2 formula itself, not a
 * provisional platform-chosen parameter the way ADR-034's cost thresholds
 * or E6's `CONFIDENCE_FLOOR` are.
 */
export function applySm2Review(current: SrsCardState, quality: number): SrsCardState {
  const nextEaseFactor = Math.max(
    MINIMUM_EASE_FACTOR,
    current.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  if (quality < 3) {
    return {
      easeFactor: nextEaseFactor,
      intervalDays: FAILED_RECALL_INTERVAL_DAYS,
      repetitions: 0,
    };
  }

  const nextRepetitions = current.repetitions + 1;
  const nextIntervalDays =
    nextRepetitions === 1
      ? FIRST_REPETITION_INTERVAL_DAYS
      : nextRepetitions === 2
        ? SECOND_REPETITION_INTERVAL_DAYS
        : Math.round(current.intervalDays * nextEaseFactor);

  return {
    easeFactor: nextEaseFactor,
    intervalDays: nextIntervalDays,
    repetitions: nextRepetitions,
  };
}
