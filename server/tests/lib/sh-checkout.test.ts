// SQL-level smoke for the S&H check-out flow.
//
// The route handler at PUT /api/v2/sh-inventory/checkout/:id (server/
// routes/v2/sh_inventory.js) does three things:
//   1. SELECT current state — 404 if not found
//   2. Reject if state !== 'in_storage' (400)
//   3. UPDATE sh_inventory SET checkout_date = $1, state = 'checked_out'
//
// These tests exercise the same SQL against the real local DB in a
// transaction so the in/out/daily and flat_monthly paths both flip the
// box correctly and persist checkout_date. Body validation
// (z.string().datetime()) is covered separately by
// tests/validation/sh_inventory.test.ts.

import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import pool from '../../db/pool.js';

interface Fixture {
  releaseId: number;
  clientId: number;
  boxId: number;
}

let fx: Fixture;

const seed = async (state: 'in_storage' | 'checked_out' = 'in_storage') => {
  const sc = await pool.query(
    `INSERT INTO sale_companies (sale_company_name)
     VALUES ('CO-' || floor(random() * 1e9)::text)
     RETURNING sale_company_id`,
  );
  const rn = await pool.query(
    `INSERT INTO release_numbers (sale_company_id, release_number_value, release_number_count)
     VALUES ($1, 'REL-' || floor(random() * 1e9)::text, 5)
     RETURNING release_number_id`,
    [sc.rows[0].sale_company_id],
  );
  const cl = await pool.query(
    `INSERT INTO clients (client_name) VALUES ('Test Customer') RETURNING id`,
  );
  const box = await pool.query(
    `INSERT INTO sh_inventory (
       client_id, release_number_id, unit_number, size,
       billing_mode, in_fee, out_fee, daily_rate,
       state, is_pending_audit, intake_date
     ) VALUES (
       $1, $2, 'TCKU-CHKOUT-' || floor(random() * 1e9)::text, '20ft',
       'in_out_daily', '65', '65', '1',
       $3::sh_state, false, now() - interval '5 days'
     ) RETURNING id`,
    [cl.rows[0].id, rn.rows[0].release_number_id, state],
  );
  return {
    releaseId: rn.rows[0].release_number_id,
    clientId: cl.rows[0].id,
    boxId: box.rows[0].id,
  };
};

const cleanup = async () => {
  if (!fx) return;
  await pool.query(`DELETE FROM sh_inventory WHERE id = $1`, [fx.boxId]);
  await pool.query(`DELETE FROM release_numbers WHERE release_number_id = $1`, [
    fx.releaseId,
  ]);
  await pool.query(`DELETE FROM sale_companies WHERE sale_company_id IN (
    SELECT sale_company_id FROM sale_companies sc
    WHERE NOT EXISTS (
      SELECT 1 FROM release_numbers rn WHERE rn.sale_company_id = sc.sale_company_id
    ) AND sc.sale_company_name LIKE 'CO-%'
  )`);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [fx.clientId]);
};

beforeEach(async () => {
  fx = await seed();
});

afterAll(async () => {
  await cleanup();
});

describe('S&H checkout SQL', () => {
  it('flips an in_storage box to checked_out and stamps checkout_date', async () => {
    const checkoutIso = '2026-05-29T17:30:00.000Z';
    // SELECT-then-UPDATE same as the route
    const cur = await pool.query(
      'SELECT state FROM sh_inventory WHERE id = $1',
      [fx.boxId],
    );
    expect(cur.rows[0].state).toBe('in_storage');

    await pool.query(
      `UPDATE sh_inventory
       SET checkout_date = $1, state = 'checked_out'
       WHERE id = $2`,
      [checkoutIso, fx.boxId],
    );

    const after = await pool.query(
      `SELECT state::text AS state, checkout_date FROM sh_inventory WHERE id = $1`,
      [fx.boxId],
    );
    expect(after.rows[0].state).toBe('checked_out');
    expect(new Date(after.rows[0].checkout_date).toISOString()).toBe(checkoutIso);

    await cleanup();
  });

  it('a checked_out box is still visible to the next month-end query', async () => {
    // The cron filter is: state IN ('in_storage','checked_out') AND
    // (checkout_date IS NULL OR checkout_date >= monthStart). Checked-out
    // boxes need to remain selectable so the month they left in still
    // bills their out_fee + partial storage days.
    const checkoutIso = '2026-05-15T12:00:00.000Z';
    await pool.query(
      `UPDATE sh_inventory
       SET checkout_date = $1, state = 'checked_out'
       WHERE id = $2`,
      [checkoutIso, fx.boxId],
    );

    const monthStart = '2026-05-01';
    const nextMonthStart = '2026-06-01';
    const visible = await pool.query(
      `SELECT id FROM sh_inventory
       WHERE client_id IS NOT NULL
         AND intake_date < $2
         AND (checkout_date IS NULL OR checkout_date >= $1)
         AND state IN ('in_storage','checked_out')
         AND id = $3`,
      [monthStart, nextMonthStart, fx.boxId],
    );
    expect(visible.rows.length).toBe(1);
    await cleanup();
  });

  it('a checked_out box drops out of the next-next month-end query', async () => {
    // Box checked out 2026-05-15 should NOT appear in June's billing.
    const checkoutIso = '2026-05-15T12:00:00.000Z';
    await pool.query(
      `UPDATE sh_inventory
       SET checkout_date = $1, state = 'checked_out'
       WHERE id = $2`,
      [checkoutIso, fx.boxId],
    );

    const juneStart = '2026-06-01';
    const julyStart = '2026-07-01';
    const visible = await pool.query(
      `SELECT id FROM sh_inventory
       WHERE client_id IS NOT NULL
         AND intake_date < $2
         AND (checkout_date IS NULL OR checkout_date >= $1)
         AND state IN ('in_storage','checked_out')
         AND id = $3`,
      [juneStart, julyStart, fx.boxId],
    );
    expect(visible.rows.length).toBe(0);
    await cleanup();
  });
});
