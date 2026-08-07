import { computeAdjustmentMultiplier, nextCalendarDate } from './daily-goal-adjustment.util.js';

describe('computeAdjustmentMultiplier', () => {
  it('returns the base multiplier when there is no recent history at all', () => {
    expect(computeAdjustmentMultiplier([])).toBe(1);
  });

  it('scales up when recent completion rate is at or above the high threshold', () => {
    expect(computeAdjustmentMultiplier([true, true, true])).toBe(1.1);
    expect(computeAdjustmentMultiplier([true, true, false])).toBe(1.1); // 2/3 >= 0.66
  });

  it('scales down when recent completion rate is at or below the low threshold', () => {
    expect(computeAdjustmentMultiplier([false, false, false])).toBe(0.9);
    expect(computeAdjustmentMultiplier([false, false, true])).toBe(0.9); // 1/3 <= 0.33
  });

  it('stays at the base multiplier for a middling completion rate', () => {
    expect(computeAdjustmentMultiplier([true, false])).toBe(1); // 0.5, between the two thresholds
  });
});

describe('nextCalendarDate', () => {
  it('increments an ordinary day', () => {
    expect(nextCalendarDate('2026-03-15')).toBe('2026-03-16');
  });

  it('rolls over a month boundary', () => {
    expect(nextCalendarDate('2026-03-31')).toBe('2026-04-01');
  });

  it('rolls over a year boundary', () => {
    expect(nextCalendarDate('2026-12-31')).toBe('2027-01-01');
  });

  it('handles a leap-year February correctly', () => {
    expect(nextCalendarDate('2028-02-28')).toBe('2028-02-29');
    expect(nextCalendarDate('2028-02-29')).toBe('2028-03-01');
  });

  it('handles a non-leap-year February correctly', () => {
    expect(nextCalendarDate('2026-02-28')).toBe('2026-03-01');
  });
});
