import { describe, it, expect } from 'vitest';
import { countStorageDays, easternYearMonth, storageDaysForMonth } from '../../lib/sh.js';

// All fixtures below use explicit UTC ISO instants (rather than the local
// `new Date(y, m, d)` constructor) so the expected Eastern calendar day is
// fixed no matter what timezone the test runner's own process happens to be
// in — exactly the ambiguity this file's boundary math has to resolve.
// Noon UTC is comfortably clear of the America/New_York midnight boundary
// in both EST (-5) and EDT (-4), so `T12:00:00Z` reads as "that same day,
// no special timing" fixtures.

describe('countStorageDays', () => {
  it('returns 1 when arrival and checkout are the same day', () => {
    const d = new Date('2026-01-05T12:00:00Z');
    expect(countStorageDays(d, d)).toBe(1);
  });

  it('counts inclusive on both endpoints', () => {
    // Per PLAN §4.2 example: Jan 5 → Jan 8 = 4 days
    const start = new Date('2026-01-05T12:00:00Z');
    const end = new Date('2026-01-08T12:00:00Z');
    expect(countStorageDays(start, end)).toBe(4);
  });

  it('returns 0 if end is before start', () => {
    const start = new Date('2026-01-10T12:00:00Z');
    const end = new Date('2026-01-05T12:00:00Z');
    expect(countStorageDays(start, end)).toBe(0);
  });

  it('ignores time-of-day differences', () => {
    // 11:59pm Eastern on the 5th and 12:01am Eastern on the 8th — both
    // EST (-5) in January.
    const start = new Date('2026-01-06T04:59:00Z');
    const end = new Date('2026-01-08T05:01:00Z');
    expect(countStorageDays(start, end)).toBe(4);
  });

  it('crosses month boundaries cleanly', () => {
    const start = new Date('2026-01-30T12:00:00Z'); // Jan 30
    const end = new Date('2026-02-02T12:00:00Z');    // Feb 2 — Jan 30, 31, Feb 1, 2 = 4 days
    expect(countStorageDays(start, end)).toBe(4);
  });
});

describe('storageDaysForMonth', () => {
  it('counts in-month arrival, no checkout, full remaining month', () => {
    const intake = new Date('2026-01-05T12:00:00Z');
    // Jan 5 through Jan 31 inclusive = 27 days
    expect(storageDaysForMonth(intake, null, 2026, 0)).toBe(27);
  });

  it('counts pre-month arrival as starting on day 1 of the month', () => {
    const intake = new Date('2025-12-20T12:00:00Z');
    // Jan 1 through Jan 31 = 31 days
    expect(storageDaysForMonth(intake, null, 2026, 0)).toBe(31);
  });

  it('caps the count at the checkout date when checkout is during the month', () => {
    const intake = new Date('2025-12-20T12:00:00Z');
    const checkout = new Date('2026-01-10T12:00:00Z');
    // Jan 1 through Jan 10 = 10 days
    expect(storageDaysForMonth(intake, checkout, 2026, 0)).toBe(10);
  });

  it('returns 0 when checkout is before the month', () => {
    const intake = new Date('2025-11-01T12:00:00Z');
    const checkout = new Date('2025-12-31T12:00:00Z');
    expect(storageDaysForMonth(intake, checkout, 2026, 0)).toBe(0);
  });

  it('returns 0 when intake is after the month', () => {
    const intake = new Date('2026-02-05T12:00:00Z');
    expect(storageDaysForMonth(intake, null, 2026, 0)).toBe(0);
  });

  it('handles intake and checkout in the same month', () => {
    const intake = new Date('2026-01-05T12:00:00Z');
    const checkout = new Date('2026-01-08T12:00:00Z');
    expect(storageDaysForMonth(intake, checkout, 2026, 0)).toBe(4);
  });

  it('handles February (28 days) correctly', () => {
    const intake = new Date('2026-01-15T12:00:00Z');
    // Feb 1 through Feb 28 = 28 days
    expect(storageDaysForMonth(intake, null, 2026, 1)).toBe(28);
  });

  it('handles leap-year February (29 days) correctly', () => {
    const intake = new Date('2024-01-15T12:00:00Z');
    // Feb 1 through Feb 29 = 29 days
    expect(storageDaysForMonth(intake, null, 2024, 1)).toBe(29);
  });
});

// Regression coverage for the UTC-vs-Eastern boundary bug: the server runs
// in UTC (node:20-alpine, no TZ set), but the yard bills on Eastern wall
// clock. A box event stamped late in the Eastern evening lands on the NEXT
// UTC day, so any boundary math built on process-local getters silently
// slides it into the following billing month — double-billing a storage
// day across two invoices. These fixtures fail against the pre-fix
// `getFullYear()/getMonth()/getDate()` version of sh.ts under a UTC
// process timezone (i.e. in CI and in prod), even though they happen to
// pass in a dev shell whose local zone is already America/New_York.
describe('Eastern-timezone boundaries (regression)', () => {
  it('attributes a late-evening EDT checkout to its own Eastern day, not the next UTC day', () => {
    // 9:00pm EDT on Oct 31 2026 is stored as 2026-11-01T01:00:00Z.
    expect(easternYearMonth(new Date('2026-11-01T01:00:00Z'))).toEqual({
      year: 2026,
      month: 9, // October, 0-indexed
    });
  });

  it('bills the checkout day in the month it actually happened in Eastern time, not UTC', () => {
    const intake = new Date('2026-10-01T12:00:00Z');
    const checkout = new Date('2026-11-01T01:00:00Z'); // 9pm EDT Oct 31
    // October must include the checkout day (Oct 1 - Oct 31 inclusive = 31).
    expect(storageDaysForMonth(intake, checkout, 2026, 9)).toBe(31);
    // November must not phantom-bill any part of a box that already left
    // in Eastern-October.
    expect(storageDaysForMonth(intake, checkout, 2026, 10)).toBe(0);
  });

  it('resolves the correct Eastern day across the fall-back DST transition, not a fixed offset', () => {
    // DST ends Sunday Nov 1 2026 at 2am EDT -> 1am EST. A fixed "subtract
    // 4 hours" patch gets the EDT case right and the EST case wrong (or
    // vice versa) — only a real zone-aware conversion gets both.
    const beforeTransition = new Date('2026-11-01T01:00:00Z'); // 9pm EDT Oct 31 (UTC-4)
    const afterTransition = new Date('2026-11-03T02:00:00Z'); // 9pm EST Nov 2 (UTC-5)
    expect(easternYearMonth(beforeTransition)).toEqual({ year: 2026, month: 9 });
    expect(easternYearMonth(afterTransition)).toEqual({ year: 2026, month: 10 });
  });

  it('counts storage days correctly across the fall-back transition day itself', () => {
    // Nov 1 2026 is 25 real hours long in Eastern time (clocks repeat
    // 1-2am). Intake is a boundary-safe noon-UTC instant (Oct 31);
    // checkout is 11pm EST on Nov 2, stored as 2026-11-03T04:00:00Z — a
    // UTC-local read misattributes it to Nov 3 and phantom-bills a 4th
    // day. Correct Eastern attribution: Oct 31 -> Nov 2 inclusive = 3.
    const intake = new Date('2026-10-31T12:00:00Z');
    const checkout = new Date('2026-11-03T04:00:00Z');
    expect(countStorageDays(intake, checkout)).toBe(3);
  });
});

import {
  buildLinesForBox,
  generateShMonthEnd,
  priorMonth,
  type ShInventoryRow,
} from '../../lib/sh-month-end.js';

describe('buildLinesForBox, priorMonth & generateShMonthEnd', () => {
  const baseBox: ShInventoryRow = {
    id: 42,
    client_id: 7,
    unit_number: 'ATCU-1001',
    intake_date: '2026-04-01T12:00:00Z',
    checkout_date: null,
    in_fee: '65.00',
    out_fee: '65.00',
    daily_rate: '2.50',
    flat_rate: '150.00',
    billing_mode: 'in_out_daily',
    state: 'in_storage',
  };

  it('returns empty lines for non_billable boxes', () => {
    const lines = buildLinesForBox(
      { ...baseBox, billing_mode: 'non_billable' },
      2026,
      3,
    );
    expect(lines).toEqual([]);
  });

  it('bills full flat_monthly rate when in storage for the entire month', () => {
    const lines = buildLinesForBox(
      {
        ...baseBox,
        billing_mode: 'flat_monthly',
        intake_date: '2026-03-15T12:00:00Z',
        checkout_date: null,
        flat_rate: '150.00',
      },
      2026,
      3, // April (30 days)
    );
    expect(lines).toEqual([
      {
        sh_box_id: 42,
        line_type: 'flat_month',
        days_count: 30,
        rate: '150.00',
        amount: '150.00',
        description: 'Flat monthly storage · ATCU-1001',
      },
    ]);
  });

  it('pro-rates flat_monthly rate for mid-month arrival or checkout', () => {
    const lines = buildLinesForBox(
      {
        ...baseBox,
        billing_mode: 'flat_monthly',
        intake_date: '2026-04-16T12:00:00Z', // Apr 16..30 = 15 of 30 days
        checkout_date: null,
        flat_rate: '150.00',
      },
      2026,
      3,
    );
    expect(lines).toEqual([
      {
        sh_box_id: 42,
        line_type: 'flat_month',
        days_count: 15,
        rate: '150.00',
        amount: '75.00',
        description: 'Flat monthly storage · ATCU-1001 · 15 of 30 days pro-rated',
      },
    ]);
  });

  it('supports anniversary billing mode with 30-day cycle proration even in 31-day months', () => {
    const lines = buildLinesForBox(
      {
        ...baseBox,
        billing_mode: 'anniversary',
        intake_date: '2026-05-17T12:00:00Z', // May 17..31 = 15 days in 31-day month
        checkout_date: null,
        flat_rate: '150.00',
      },
      2026,
      4, // May
    );
    expect(lines[0].amount).toBe('75.00');
    expect(lines[0].days_count).toBe(15);
  });

  it('normalizes in_out_daily amounts and skips zero fees', () => {
    const lines = buildLinesForBox(
      {
        ...baseBox,
        billing_mode: 'in_out_daily',
        intake_date: '2026-04-10T12:00:00Z',
        checkout_date: '2026-04-12T12:00:00Z',
        in_fee: '65',
        out_fee: '0.00',
        daily_rate: '3',
      },
      2026,
      3,
    );
    expect(lines).toEqual([
      {
        sh_box_id: 42,
        line_type: 'in_fee',
        days_count: null,
        rate: '65',
        amount: '65.00',
        description: 'Intake fee · ATCU-1001',
      },
      {
        sh_box_id: 42,
        line_type: 'storage_days',
        days_count: 3,
        rate: '3',
        amount: '9.00',
        description: 'Storage · ATCU-1001 · 3 days',
      },
    ]);
  });

  it('computes priorMonth in America/New_York timezone even near UTC midnight', () => {
    expect(priorMonth(new Date('2026-05-01T02:00:00Z'))).toEqual({
      year: 2026,
      monthIndex: 2,
    });
    expect(priorMonth(new Date('2026-05-01T05:00:00Z'))).toEqual({
      year: 2026,
      monthIndex: 3,
    });
  });

  it('generateShMonthEnd is idempotent across repeated batch runs for the same billing month', async () => {
    const createdInvoices = new Map<string, number>();
    const insertedLines: unknown[] = [];

    const fakePool = {
      connect: async () =>
        ({
          query: async (sql: string, params?: unknown[]) => {
            if (sql.includes('FROM sh_inventory')) {
              return { rows: [baseBox] };
            }
            if (sql.includes('SELECT id FROM sh_invoices')) {
              const key = `${params?.[0]}:${params?.[1]}`;
              return {
                rows: createdInvoices.has(key)
                  ? [{ id: createdInvoices.get(key) }]
                  : [],
              };
            }
            if (sql.includes('COALESCE(MAX(invoice_number)')) {
              return { rows: [{ next: 202604001 }] };
            }
            if (sql.includes('INSERT INTO sh_invoices')) {
              const key = `${params?.[0]}:${params?.[1]}`;
              createdInvoices.set(key, 99);
              return { rows: [{ id: 99 }] };
            }
            if (sql.includes('INSERT INTO sh_invoice_lines')) {
              insertedLines.push(params);
              return { rows: [] };
            }
            return { rows: [] };
          },
          release: () => {},
        }) as unknown as import('pg').PoolClient,
    };

    const firstRun = await generateShMonthEnd(2026, 3, fakePool);
    expect(firstRun.invoicesCreated).toBe(1);
    expect(firstRun.invoicesSkipped).toBe(0);
    expect(insertedLines.length).toBe(2);

    const secondRun = await generateShMonthEnd(2026, 3, fakePool);
    expect(secondRun.invoicesCreated).toBe(0);
    expect(secondRun.invoicesSkipped).toBe(1);
    expect(insertedLines.length).toBe(2); // zero duplicate line items
  });
});


