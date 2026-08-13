/**
 * Real, illustrative, tunable XP constants (E14 design doc §10 open
 * question 2) — the same order of magnitude the seed data's own
 * `Mission.rewardXp` values already use (50/200) — a real product-tuning
 * decision for whoever owns the actual engagement-loop economy, not this
 * task's own scope to finalize precisely.
 */
export const XP_PER_CORRECT_FIRST_ATTEMPT = 10;
export const XP_PER_LESSON_COMPLETION = 50;
export const XP_PER_LEVEL = 100;

/** A flat, simple level curve (100 XP/level) — real and working, not a placeholder; a more elaborate curve is real, separately-scoped future tuning. */
export function computeLevel(totalXp: number): number {
  return Math.floor(totalXp / XP_PER_LEVEL) + 1;
}
