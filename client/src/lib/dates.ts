// Date helpers for invoice/quote dates. These fields are calendar days in
// the yard's timezone (America/New_York), not instants. The server stores
// invoice_date as a timestamptz; we canonicalize a picked calendar day to
// noon UTC so it renders as the same day in every US timezone and stays
// stable across save/reload round-trips (noon UTC is the same calendar day
// from Hawaii through Eastern). Using bare `new Date("YYYY-MM-DD")` parses
// as UTC midnight, which displays as the previous day for any ET viewer.

const EASTERN = 'America/New_York';

// timestamptz/ISO string -> "YYYY-MM-DD" for an <input type="date">,
// resolved in Eastern time. A value already in "YYYY-MM-DD" form is
// returned unchanged.
export function isoToEasternDate(iso: string | null | undefined): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// "YYYY-MM-DD" picked calendar day -> ISO timestamp at noon UTC (the same
// calendar day in every US timezone, and stable when read back through
// isoToEasternDate). A non-date string is best-effort parsed; empty input
// yields null.
export function easternDateToISO(
  dateStr: string | null | undefined,
): string | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) {
    const d = new Date(dateStr);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  return `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
}

// Today's calendar day in Eastern time as "YYYY-MM-DD".
export function todayEastern(): string {
  return isoToEasternDate(new Date().toISOString());
}
