import { describe, expect, it } from 'vitest';

import { toLocalCalendarDate } from './to-local-calendar-date.js';

describe('toLocalCalendarDate', () => {
  it('returns the UTC calendar date when timeZone is UTC', () => {
    expect(toLocalCalendarDate('2026-01-05T20:00:00Z', 'UTC')).toBe('2026-01-05');
  });

  it('rolls forward to the next calendar day in a timezone ahead of UTC', () => {
    // 20:00 UTC + 5:30 (IST) = 01:30 the next day.
    expect(toLocalCalendarDate('2026-01-05T20:00:00Z', 'Asia/Kolkata')).toBe('2026-01-06');
  });

  it('stays on the same calendar day in a timezone behind UTC', () => {
    // 20:00 UTC - 8:00 (PST) = 12:00 the same day.
    expect(toLocalCalendarDate('2026-01-05T20:00:00Z', 'America/Los_Angeles')).toBe('2026-01-05');
  });

  it('accepts a Date instance as well as an ISO string', () => {
    const instant = new Date('2026-06-15T12:00:00Z');
    expect(toLocalCalendarDate(instant, 'UTC')).toBe('2026-06-15');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toLocalCalendarDate('2026-03-04T00:00:00Z', 'UTC')).toBe('2026-03-04');
  });

  it('throws RangeError for an invalid instant', () => {
    expect(() => toLocalCalendarDate('not-a-date', 'UTC')).toThrow(RangeError);
  });

  it('throws RangeError for an invalid IANA timezone', () => {
    expect(() => toLocalCalendarDate('2026-01-05T00:00:00Z', 'Not/AZone')).toThrow(RangeError);
  });

  it('reuses a cached formatter across repeated calls with the same timezone', () => {
    // Not directly observable from the public API, but calling twice must
    // still produce correct, independent results (i.e. the cached
    // formatter isn't mutated/stateful across calls).
    expect(toLocalCalendarDate('2026-01-05T20:00:00Z', 'Asia/Kolkata')).toBe('2026-01-06');
    expect(toLocalCalendarDate('2026-06-15T12:00:00Z', 'Asia/Kolkata')).toBe('2026-06-15');
  });
});
