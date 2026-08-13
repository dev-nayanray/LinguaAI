import { calendarDayDiff, computeStreakUpdate } from './streak-update.util.js';

describe('calendarDayDiff', () => {
  it('returns 0 for the same calendar date', () => {
    expect(calendarDayDiff('2026-08-13', '2026-08-13')).toBe(0);
  });

  it('returns 1 for consecutive calendar dates', () => {
    expect(calendarDayDiff('2026-08-13', '2026-08-14')).toBe(1);
  });

  it('returns a real gap for non-consecutive dates', () => {
    expect(calendarDayDiff('2026-08-10', '2026-08-14')).toBe(4);
  });

  it('crosses a month boundary correctly', () => {
    expect(calendarDayDiff('2026-07-31', '2026-08-01')).toBe(1);
  });
});

describe('computeStreakUpdate', () => {
  it('no-ops (changed: false) when already active today', () => {
    const result = computeStreakUpdate(5, 10, '2026-08-13', '2026-08-13');

    expect(result).toEqual({ currentStreak: 5, longestStreak: 10, changed: false });
  });

  it('increments the streak on a consecutive day', () => {
    const result = computeStreakUpdate(5, 10, '2026-08-13', '2026-08-14');

    expect(result).toEqual({ currentStreak: 6, longestStreak: 10, changed: true });
  });

  it('bumps longestStreak when the new streak exceeds it', () => {
    const result = computeStreakUpdate(10, 10, '2026-08-13', '2026-08-14');

    expect(result).toEqual({ currentStreak: 11, longestStreak: 11, changed: true });
  });

  it('resets to 1 when a full day (or more) was skipped -- the real grace-window policy', () => {
    const result = computeStreakUpdate(20, 25, '2026-08-10', '2026-08-14');

    expect(result).toEqual({ currentStreak: 1, longestStreak: 25, changed: true });
  });

  it('never resets longestStreak, even when the current streak breaks', () => {
    const result = computeStreakUpdate(2, 30, '2026-08-01', '2026-08-13');

    expect(result.longestStreak).toBe(30);
  });
});
