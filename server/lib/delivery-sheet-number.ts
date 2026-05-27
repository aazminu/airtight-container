// Delivery-sheet "AT number" sequencing: ATYYYYMM### (e.g. AT202605001),
// the sequence resetting to 001 each calendar month (America/New_York).
// Mirrors the sales-invoice number pattern in invoice-ops.ts — a
// transaction-scoped advisory lock keeps two concurrent delivery-sheet
// creates from picking the same number.

import type { PoolClient } from 'pg';

// Distinct from SALES_INVOICE_SEQ_LOCK_KEY. Hex derived from "ATSEQ##".
const DELIVERY_SHEET_SEQ_LOCK_KEY = 0x4154_5345_5123_2323n.toString();

// "AT" + YYYYMM in Eastern time, e.g. "AT202605". Eastern so the monthly
// rollover matches the yard's clock, not UTC.
export function deliverySheetMonthPrefix(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  return `AT${y}${m}`;
}

/**
 * Allocate the next AT number for the current month. Caller must already
 * have a transaction open on `client`; the lock releases at COMMIT, by
 * which point the new number's row is committed and visible to the next
 * caller's MAX(). Throws if the 3-digit suffix is exhausted (999).
 */
export async function allocateDeliverySheetNumber(
  client: PoolClient,
  date: Date = new Date(),
): Promise<string> {
  await client.query('SELECT pg_advisory_xact_lock($1)', [
    DELIVERY_SHEET_SEQ_LOCK_KEY,
  ]);
  const prefix = deliverySheetMonthPrefix(date); // AT202605 (8 chars)
  const { rows } = await client.query<{ next: number }>(
    `SELECT COALESCE(MAX(substring(delivery_sheet_number FROM 9 FOR 3)::int), 0) + 1 AS next
     FROM reports
     WHERE delivery_sheet_number LIKE $1`,
    [`${prefix}%`],
  );
  const next = rows[0].next;
  if (next > 999) {
    throw new Error(
      `Out of delivery-sheet numbers for ${prefix} (sequence exhausted at 999)`,
    );
  }
  return `${prefix}${String(next).padStart(3, '0')}`;
}
