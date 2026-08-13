/**
 * The real, resolved streak grace-window policy (E14 design doc §3.2/§6.2)
 * — a pure calendar-date diff between two `YYYY-MM-DD` strings (both
 * already computed via `toLocalCalendarDate`, so DST/travel are already
 * handled by that step; this function only does the day-count arithmetic).
 * `diff === 0` → already active today (no-op); `diff === 1` → consecutive
 * day (increment); `diff > 1` → streak broken (reset to 1). This *is* the
 * grace window ARCHITECTURE_REVIEW's own named finding asked for — a full
 * local calendar day of buffer, not a naive 24-hour rolling window, so a
 * learner active at 11:58pm and again at 12:02am their own local time is
 * never penalized.
 */
export function calendarDayDiff(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export interface StreakUpdateResult {
  currentStreak: number;
  longestStreak: number;
  /** `false` when today's activity is a no-op against an already-current streak (diff === 0) — nothing to persist. */
  changed: boolean;
}

/**
 * Pure transition function — no Prisma/IO, exhaustively unit-testable in
 * isolation (matching `scoreExerciseResponse`/SM-2 `srs-scheduling.util.ts`'s
 * own established "pure logic separated from persistence" precedent).
 */
export function computeStreakUpdate(
  currentStreak: number,
  longestStreak: number,
  lastActiveDate: string,
  today: string,
): StreakUpdateResult {
  const diff = calendarDayDiff(lastActiveDate, today);
  if (diff === 0) {
    return { currentStreak, longestStreak, changed: false };
  }
  const newStreak = diff === 1 ? currentStreak + 1 : 1;
  return {
    currentStreak: newStreak,
    longestStreak: Math.max(longestStreak, newStreak),
    changed: true,
  };
}
