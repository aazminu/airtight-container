// Storage & Handling shared helpers.
//
// Day counting per PLAN §4.2: INCLUSIVE of the arrival day. Box in on
// Jan 5 and out on Jan 8 = 4 storage days. End-of-month invoicing caps
// the count at the last day of the month (Jan 31 if still in storage).

/**
 * Number of storage days between two dates, treating both endpoints as
 * full days in the local timezone of the server. Inclusive of both.
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
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0); // last day of month

  const periodStart = intakeDate > monthStart ? intakeDate : monthStart;
  const periodEndCandidate = checkoutDate ?? monthEnd;
  const periodEnd = periodEndCandidate < monthEnd ? periodEndCandidate : monthEnd;

  if (periodStart > monthEnd || periodEnd < monthStart) return 0;
  return countStorageDays(periodStart, periodEnd);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
