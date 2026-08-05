const calendarDateFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Returns the calendar date (`YYYY-MM-DD`) that `instant` falls on within
 * `timeZone`. Streak/streak-adjacent logic (ARCHITECTURE.md §7,
 * DATABASE.md's `Streak` entity) stores instants as UTC (API_GUIDELINES.md:
 * "the API never returns pre-localized dates") but must compare *calendar
 * days in the user's timezone* — this is the pure building block for that
 * comparison, decoupled from any streak-specific rules (grace windows,
 * etc.), which land in E14.
 *
 * `timeZone` must be a valid IANA zone (e.g. `"Asia/Kolkata"`); an invalid
 * zone throws `RangeError`, per `Intl.DateTimeFormat`'s native behavior —
 * deliberately not caught here so callers see it immediately.
 */
export function toLocalCalendarDate(instant: Date | string, timeZone: string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`toLocalCalendarDate: invalid instant "${String(instant)}"`);
  }

  let formatter = calendarDateFormatters.get(timeZone);
  if (!formatter) {
    // en-CA formats as YYYY-MM-DD — verified empirically, not a documented
    // guarantee of the locale, but stable across Node's bundled ICU.
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    calendarDateFormatters.set(timeZone, formatter);
  }

  return formatter.format(date);
}
