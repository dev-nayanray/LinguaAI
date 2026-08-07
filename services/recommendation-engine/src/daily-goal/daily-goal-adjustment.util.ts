import {
  BASE_MULTIPLIER,
  HIGH_COMPLETION_MULTIPLIER,
  HIGH_COMPLETION_THRESHOLD,
  LOW_COMPLETION_MULTIPLIER,
  LOW_COMPLETION_THRESHOLD,
} from './daily-goal.constants.js';

/**
 * §6.3's "did they hit or miss their last N goals" adjustment — a real,
 * documented (if provisional) formula, not a calibrated model. Pure and
 * I/O-free, the same testability precedent every other scoring/selection
 * function in this codebase already follows. No recent history at all
 * (a brand-new plan) is the base multiplier, not a guess in either
 * direction.
 */
export function computeAdjustmentMultiplier(recentCompletions: readonly boolean[]): number {
  if (recentCompletions.length === 0) {
    return BASE_MULTIPLIER;
  }
  const completedCount = recentCompletions.filter(Boolean).length;
  const completionRate = completedCount / recentCompletions.length;

  if (completionRate >= HIGH_COMPLETION_THRESHOLD) {
    return HIGH_COMPLETION_MULTIPLIER;
  }
  if (completionRate <= LOW_COMPLETION_THRESHOLD) {
    return LOW_COMPLETION_MULTIPLIER;
  }
  return BASE_MULTIPLIER;
}

/**
 * Pure calendar-date arithmetic (no timezone/DST concerns — `dateString`
 * is already a `YYYY-MM-DD` calendar date, not an instant) — `Date.UTC`'s
 * own day-overflow normalization correctly rolls month/year boundaries.
 */
export function nextCalendarDate(dateString: string): string {
  const parts = dateString.split('-').map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}
