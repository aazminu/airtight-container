// Storage & Handling shared helpers.
//
// Day counting per PLAN §4.2: INCLUSIVE of the arrival day. Box in on
// Jan 5 and out on Jan 8 = 4 storage days. End-of-month invoicing caps
// the count at the last day of the month (Jan 31 if still in storage).

const YARD_TZ = 'America/New_York';

// Eastern-calendar-date parts for an instant, mirroring the
// Intl.DateTimeFormat approach in quote-number.ts's easternMonthPrefix.
// The server itself carries no TZ (node:20-alpine defaults to UTC), so
// `d.getFullYear()`/`getMonth()`/`getDate()` would read the box's
// intake/checkout instant back in UTC, not the yard's Eastern time.
function easternDateParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: YARD_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  return {
    year: Number(parts.find((p) => p.type === 'year')!.value),
    month: Number(parts.find((p) => p.type === 'month')!.value),
    day: Number(parts.find((p) => p.type === 'day')!.value),
  };
}

// Eastern year/month (month 0-11, matching the monthIndex convention used
// throughout this file and sh-month-end.ts) for an instant. Exported so
// sh-month-end.ts can classify "did this box's intake/checkout fall in
// billing month X" without reaching for local getters itself.
export function easternYearMonth(d: Date): { year: number; month: number } {
  const { year, month } = easternDateParts(d);
  return { year, month: month - 1 };
}

/**
 * Number of storage days between two dates, treating both endpoints as
 * full days in America/New_York (the yard's timezone) regardless of the
 * server process's own timezone. Inclusive of both.
 *
 * Returns 0 if `end` is before `start`. Returns 1 if they're the same day.
 */
export function countStorageDays(start: Date, end: Date): number {
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  const ms = endDay.getTime() - startDay.getTime();
  if (ms < 0) return 0;
  // +1 because the range is inclusive of both endpoints.
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Storage days for an `sh_inventory` box across a billing month.
 * If the box arrived before the month started, count from day 1.
 * If it checked out during the month, count to checkout date.
 * Otherwise count to the last day of the month.
 */
export function storageDaysForMonth(
  intakeDate: Date,
  checkoutDate: Date | null,
  year: number,
  monthIndex: number, // 0-11
): number {
  // year/monthIndex already name an Eastern billing month (the caller's
  // contract), so these boundaries are built directly rather than run
  // through easternDateParts — they're not real instants needing zone
  // conversion.
  const monthStart = new Date(Date.UTC(year, monthIndex, 1, 12));
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 12)); // last day of month

  const intakeDay = startOfDay(intakeDate);
  const checkoutDay = checkoutDate ? startOfDay(checkoutDate) : null;

  const periodStart = intakeDay > monthStart ? intakeDay : monthStart;
  const periodEndCandidate = checkoutDay ?? monthEnd;
  const periodEnd = periodEndCandidate < monthEnd ? periodEndCandidate : monthEnd;

  if (periodStart > monthEnd || periodEnd < monthStart) return 0;
  return countStorageDays(periodStart, periodEnd);
}

// Real-world UTC instant for Eastern midnight of the given Eastern
// calendar day (month 0-11). Unlike startOfDay's noon-anchored index,
// this is a genuine comparison bound against timestamptz columns — used
// by sh-month-end.ts to select candidate boxes for a billing month
// without cutting off late-evening EDT/EST activity a few hours before
// UTC's own midnight rolls over.
export function easternMidnightUtc(year: number, monthIndex: number, day: number): Date {
  // Eastern is always UTC-4 (EDT) or UTC-5 (EST); guess EST and correct
  // once we see which offset the guessed instant actually renders as.
  const guess = new Date(Date.UTC(year, monthIndex, day, 5, 0, 0));
  const hour =
    Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: YARD_TZ,
        hour: '2-digit',
        hour12: false,
      })
        .formatToParts(guess)
        .find((p) => p.type === 'hour')!.value,
    ) % 24;
  return hour === 0 ? guess : new Date(Date.UTC(year, monthIndex, day, 4, 0, 0));
}

// Indexes an instant's Eastern calendar day at NOON UTC rather than
// midnight. Midnight UTC falls on the wrong side of the Eastern calendar
// day for several hours a day (America/New_York is UTC-4 or UTC-5,
// depending on DST), so re-deriving the Eastern date from a midnight-UTC
// stamp can walk the day back by one. Noon UTC is always 7-8h clear of
// that boundary in both EST and EDT, and neighboring days are always
// exactly 24h apart in UTC, so ms-based day counting stays exact across
// DST transitions and this function is idempotent if applied twice.
function startOfDay(d: Date): Date {
  const { year, month, day } = easternDateParts(d);
  return new Date(Date.UTC(year, month - 1, day, 12));
}
