// Integration tests for lib/sh-month-end.ts. Same per-test
// BEGIN/ROLLBACK pattern as invoice-ops.test.ts.
//
// NOTE: generateShMonthEnd opens its own pool.connect() rather than
// accepting a PoolClient param (cron-fired entry point). That means
// inserts it makes won't see the test transaction's data — so these
// tests INSERT fixtures, COMMIT, run the generator, then clean up
// explicitly. A more invasive refactor would pass a connection in;
// for now the explicit cleanup is simpler than retrofitting it.

import 'dotenv/config';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import pool from '../../db/pool.js';
import { generateShMonthEnd, priorMonth } from '../../lib/sh-month-end.js';

interface Fixtures {
  clientId: number;
  boxA: number; // intake + checkout in test month
  boxB: number; // intake before, still in storage
}

let fx: Fixtures;
const TEST_YEAR = 2099;
const TEST_MONTH_INDEX = 0; // January 2099, way out of real data range

beforeAll(async () => {
  // Pre-clean any leftover from prior failed runs at our fixture month
  await pool.query(
    `DELETE FROM sh_invoices WHERE billing_month = $1`,
    [`${TEST_YEAR}-01-01`],
  );
});

beforeEach(async () => {
  const { rows: [c] } = await pool.query<{ id: number }>(
    `INSERT INTO clients (client_name) VALUES ('sh-test-fixture') RETURNING id`,
  );
  const { rows: [a] } = await pool.query<{ id: number }>(
    `INSERT INTO sh_inventory (client_id, unit_number, size, in_fee, out_fee, daily_rate, state, intake_date, checkout_date, is_pending_audit)
     VALUES ($1, 'SH-A', '20HC', 65, 65, 2, 'checked_out', $2, $3, false)
     RETURNING id`,
    [c.id, `${TEST_YEAR}-01-10`, `${TEST_YEAR}-01-15`],
  );
  const { rows: [b] } = await pool.query<{ id: number }>(
    `INSERT INTO sh_inventory (client_id, unit_number, size, in_fee, out_fee, daily_rate, state, intake_date, checkout_date, is_pending_audit)
     VALUES ($1, 'SH-B', '40HC', 65, 65, 1, 'in_storage', $2, NULL, false)
     RETURNING id`,
    [c.id, `${TEST_YEAR - 1}-12-15`],
  );
  fx = { clientId: c.id, boxA: a.id, boxB: b.id };
});

afterEach(async () => {
  // sh_invoice_lines cascade with sh_invoices; sh_invoices we delete by client.
  await pool.query('DELETE FROM sh_invoices WHERE client_id = $1', [fx.clientId]);
  await pool.query('DELETE FROM sh_inventory WHERE client_id = $1', [fx.clientId]);
  await pool.query('DELETE FROM clients WHERE id = $1', [fx.clientId]);
});

afterAll(async () => {
  await pool.end();
});

describe('priorMonth', () => {
  it('returns the month before `now`', () => {
    expect(priorMonth(new Date('2026-05-15T12:00:00Z'))).toEqual({
      year: 2026,
      monthIndex: 3,
    });
  });
  it('handles January → previous December', () => {
    expect(priorMonth(new Date('2026-01-10T12:00:00Z'))).toEqual({
      year: 2025,
      monthIndex: 11,
    });
  });
});

describe('generateShMonthEnd', () => {
  it('creates one invoice per client with in_fee + out_fee + storage_days lines', async () => {
    const summary = await generateShMonthEnd(TEST_YEAR, TEST_MONTH_INDEX);
    // Scoped to fixture: the local DB carries other clients with
    // billable boxes in any post-cutover window, so global counts
    // aren't deterministic. What we own here is fx.clientId.
    expect(summary.invoicesCreated).toBeGreaterThanOrEqual(1);
    expect(
      summary.errors.find((e) => e.clientId === fx.clientId),
    ).toBeUndefined();

    const { rows: invs } = await pool.query(
      `SELECT id, total FROM sh_invoices WHERE client_id = $1 AND billing_month = $2`,
      [fx.clientId, `${TEST_YEAR}-01-01`],
    );
    expect(invs.length).toBe(1);

    const { rows: lines } = await pool.query(
      `SELECT line_type, days_count, rate, amount FROM sh_invoice_lines
       WHERE sh_invoice_id = $1 ORDER BY id`,
      [invs[0].id],
    );
    // Box A: in_fee (Jan 10) + out_fee (Jan 15) + storage_days (Jan 10–15 = 6 days)
    // Box B: storage_days only (Jan 1 → Jan 31 = 31 days)
    const types = lines.map((l) => l.line_type).sort();
    expect(types).toEqual(['in_fee', 'out_fee', 'storage_days', 'storage_days']);
    const storage = lines.filter((l) => l.line_type === 'storage_days');
    const aStorage = storage.find((l) => l.days_count === 6);
    const bStorage = storage.find((l) => l.days_count === 31);
    expect(aStorage).toBeDefined();
    expect(bStorage).toBeDefined();
    // Total: 65 + 65 + (6 * 2) + (31 * 1) = 173
    expect(Number(invs[0].total)).toBeCloseTo(173, 2);
  });

  it('is idempotent: second run skips the existing invoice', async () => {
    await generateShMonthEnd(TEST_YEAR, TEST_MONTH_INDEX);
    const second = await generateShMonthEnd(TEST_YEAR, TEST_MONTH_INDEX);
    // Same fixture-scoping caveat: the second run skips every
    // already-billed client (fixture included), creates none.
    expect(second.invoicesCreated).toBe(0);
    expect(second.invoicesSkipped).toBeGreaterThanOrEqual(1);
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM sh_invoices WHERE client_id = $1 AND billing_month = $2',
      [fx.clientId, `${TEST_YEAR}-01-01`],
    );
    expect(rows[0].n).toBe(1);
  });

  it('skips pending boxes (only in_storage / checked_out qualify)', async () => {
    // Re-tag both fixture boxes as pending → generator should produce zero
    await pool.query('UPDATE sh_inventory SET state = $1 WHERE client_id = $2', [
      'pending',
      fx.clientId,
    ]);
    const summary = await generateShMonthEnd(TEST_YEAR, TEST_MONTH_INDEX);
    expect(summary.invoicesCreated).toBe(0);
  });
});
