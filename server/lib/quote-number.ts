// Quote number sequencer. Mirrors getNextInvoiceNumber in
// lib/invoice-ops.ts but produces a text number in the form
// QYYYYMM### (no dashes, 3-digit suffix) with a monthly reset in Eastern
// time, and uses a DISTINCT advisory-lock key so quote numbering can't
// collide with the sales-invoice or delivery-sheet sequencers.

import type { PoolClient } from 'pg';

// Stable advisory-lock key for quote-number sequencing. Hex derived
// from "QUOTSEQ" ASCII (51 55 4f 54 53 45 51) so the value is namespaced
// and provably distinct from the invoice key (derived from "AIRSEQ#").
const QUOTE_SEQ_LOCK_KEY = 0x5155_4f54_5345_51n.toString();

// Eastern-time YYYYMM for the given instant. Quotes reset their counter
// monthly on the same wall-clock the yard operates on, so a quote created
// at 11pm ET on the last of the month doesn't roll into next month's
// sequence the way a naive UTC prefix would.
export function easternMonthPrefix(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const month = parts.find((p) => p.type === 'month')?.value ?? '00';
  return `${year}${month}`;
}

/**
 * Compute the next `quote_number` for the given YYYYMM prefix.
 * Acquires a transaction-scoped advisory lock so two concurrent callers
 * can't pick the same number. Returns a string `QYYYYMM###` with a
 * 3-digit zero-padded suffix. Throws if the suffix is exhausted (999)
 * for the month.
 *
 * Caller must already have a transaction open on `client`.
 */
export async function getNextQuoteNumber(
  client: PoolClient,
  monthPrefix: string = easternMonthPrefix(),
): Promise<string> {
  await client.query('SELECT pg_advisory_xact_lock($1)', [QUOTE_SEQ_LOCK_KEY]);
  // After migration 0019 every quote_number is QYYYYMM###; the suffix is
  // the last 3 characters. Casting NULL or non-numeric to int would throw,
  // but the migration normalizes everything, so substr(-3) is always a
  // valid 3-digit string.
  const like = `Q${monthPrefix}%`;
  const { rows } = await client.query<{ next: number }>(
    `SELECT COALESCE(
              MAX(RIGHT(quote_number, 3)::int),
              0
            ) + 1 AS next
       FROM quotes
      WHERE quote_number LIKE $1`,
    [like],
  );
  const next = rows[0].next;
  if (next > 999) {
    throw new Error(
      `Out of quote numbers for ${monthPrefix} (sequence exhausted at 999)`,
    );
  }
  return `Q${monthPrefix}${String(next).padStart(3, '0')}`;
}
