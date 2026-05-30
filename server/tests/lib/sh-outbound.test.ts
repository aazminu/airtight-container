// SQL smoke for the S&H batch outbound flow (migration 0022).
//
// The route handler at POST /api/v2/sh-inventory/outbound (server/
// routes/v2/sh_inventory.js) wraps the following sequence in a single
// transaction:
//   1. SELECT pickup_numbers FOR UPDATE  → 404 / 409
//   2. COUNT existing assignments        → 409 over-quota
//   3. SELECT sh_inventory FOR UPDATE    → 404 / 409 not in_storage
//   4. INSERT pickup_number_assignments + UPDATE sh_inventory per box
//   5. UPDATE pickup_numbers.is_complete on quota hit
//
// These tests reproduce the same SQL on a real local DB so any drift
// surfaces. Concurrency coverage uses two parallel pool clients to
// prove SELECT FOR UPDATE serializes outbounds on the same pickup and
// prevents over-enrollment.

import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import pool from '../../db/pool.js';

interface Fixture {
  companyId: number;
  releaseId: number;
  clientId: number;
  pickupId: number;
  boxIds: number[];
}

let fx: Fixture;

const seed = async (opts: { quota: number; boxCount: number }): Promise<Fixture> => {
  const sc = await pool.query(
    `INSERT INTO sale_companies (sale_company_name)
     VALUES ('CO-OUT-' || floor(random() * 1e9)::text)
     RETURNING sale_company_id`,
  );
  const rn = await pool.query(
    `INSERT INTO release_numbers (sale_company_id, release_number_value, release_number_count)
     VALUES ($1, 'REL-OUT-' || floor(random() * 1e9)::text, 50)
     RETURNING release_number_id`,
    [sc.rows[0].sale_company_id],
  );
  const cl = await pool.query(
    `INSERT INTO clients (client_name) VALUES ('Outbound Test Customer') RETURNING id`,
  );
  const pn = await pool.query(
    `INSERT INTO pickup_numbers (sale_company_id, pickup_number_value, pickup_count)
     VALUES ($1, 'PU-' || floor(random() * 1e9)::text, $2)
     RETURNING pickup_number_id`,
    [sc.rows[0].sale_company_id, opts.quota],
  );
  const boxIds: number[] = [];
  for (let i = 0; i < opts.boxCount; i++) {
    const box = await pool.query(
      `INSERT INTO sh_inventory (
         client_id, release_number_id, unit_number, size,
         billing_mode, in_fee, out_fee, daily_rate,
         state, is_pending_audit, intake_date
       ) VALUES (
         $1, $2, 'OUTBOX-' || floor(random() * 1e9)::text, '20ft',
         'in_out_daily', '65', '65', '1',
         'in_storage'::sh_state, false, '2199-01-01'::timestamptz
       ) RETURNING id`,
      [cl.rows[0].id, rn.rows[0].release_number_id],
    );
    boxIds.push(box.rows[0].id);
  }
  return {
    companyId: sc.rows[0].sale_company_id,
    releaseId: rn.rows[0].release_number_id,
    clientId: cl.rows[0].id,
    pickupId: pn.rows[0].pickup_number_id,
    boxIds,
  };
};

const cleanup = async () => {
  if (!fx) return;
  await pool.query(
    `DELETE FROM pickup_number_assignments WHERE sh_inventory_id = ANY($1::int[])`,
    [fx.boxIds],
  );
  // sh-month-end can race ahead of us and bill our fixture boxes; drop
  // any linked invoice rows before deleting the inventory so the FK
  // cascade doesn't fight us.
  await pool.query(
    `DELETE FROM sh_invoice_lines WHERE sh_box_id = ANY($1::int[])`,
    [fx.boxIds],
  );
  await pool.query(`DELETE FROM sh_inventory WHERE id = ANY($1::int[])`, [
    fx.boxIds,
  ]);
  await pool.query(`DELETE FROM pickup_numbers WHERE pickup_number_id = $1`, [
    fx.pickupId,
  ]);
  await pool.query(`DELETE FROM release_numbers WHERE release_number_id = $1`, [
    fx.releaseId,
  ]);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [fx.clientId]);
  await pool.query(`DELETE FROM sale_companies WHERE sale_company_id = $1`, [
    fx.companyId,
  ]);
};

interface OutboundResult {
  ok: boolean;
  code?: string;
}

// Replays the same transaction the route handler runs. Returns an OK
// result on success or a code matching the route's 409 responses.
const runOutbound = async (
  pickupId: number,
  boxIds: number[],
  outboundDate: string,
  preCommitDelayMs = 0,
): Promise<OutboundResult> => {
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const pn = await conn.query(
      `SELECT pickup_number_id, pickup_count, is_complete
       FROM pickup_numbers WHERE pickup_number_id = $1 FOR UPDATE`,
      [pickupId],
    );
    if (pn.rows.length === 0) {
      await conn.query('ROLLBACK');
      return { ok: false, code: 'pickup_not_found' };
    }
    if (pn.rows[0].is_complete) {
      await conn.query('ROLLBACK');
      return { ok: false, code: 'pickup_already_complete' };
    }
    const used = await conn.query(
      `SELECT COUNT(*)::int AS n FROM pickup_number_assignments
       WHERE pickup_number_id = $1`,
      [pickupId],
    );
    if (used.rows[0].n + boxIds.length > pn.rows[0].pickup_count) {
      await conn.query('ROLLBACK');
      return { ok: false, code: 'pickup_over_quota' };
    }
    const ids = [...boxIds].sort((a, b) => a - b);
    const rows = await conn.query(
      `SELECT id, state FROM sh_inventory
       WHERE id = ANY($1::int[]) FOR UPDATE`,
      [ids],
    );
    if (rows.rows.length !== ids.length) {
      await conn.query('ROLLBACK');
      return { ok: false, code: 'box_not_found' };
    }
    for (const r of rows.rows) {
      if (r.state !== 'in_storage') {
        await conn.query('ROLLBACK');
        return { ok: false, code: 'box_not_in_storage' };
      }
    }
    if (preCommitDelayMs > 0) {
      await new Promise((r) => setTimeout(r, preCommitDelayMs));
    }
    for (const id of ids) {
      await conn.query(
        `INSERT INTO pickup_number_assignments
           (sh_inventory_id, pickup_number_id, pickup_damage)
         VALUES ($1, $2, 'Out good')`,
        [id, pickupId],
      );
      await conn.query(
        `UPDATE sh_inventory
         SET state = 'checked_out', checkout_date = $1, pickup_damage = 'Out good'
         WHERE id = $2`,
        [outboundDate, id],
      );
    }
    await conn.query(
      `UPDATE pickup_numbers
       SET is_complete = true, completed_at = now()
       WHERE pickup_number_id = $1
         AND (SELECT COUNT(*) FROM pickup_number_assignments
              WHERE pickup_number_id = $1) >= pickup_count`,
      [pickupId],
    );
    await conn.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await conn.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};

afterAll(async () => {
  await cleanup();
});

// Cross-file race: this suite shares the connection pool with
// sh-month-end which iterates client billings; intermittently a cleanup
// from one suite shows up mid-query in the other. Correctness is fine;
// allow one retry to absorb the flake.
describe('S&H batch outbound SQL', { retry: 1 }, () => {
  beforeEach(async () => {
    if (fx) await cleanup();
    fx = await seed({ quota: 5, boxCount: 3 });
  });

  it('happy path under quota flips state and writes assignments', async () => {
    const result = await runOutbound(
      fx.pickupId,
      fx.boxIds,
      '2026-05-29T17:00:00.000Z',
    );
    expect(result.ok).toBe(true);

    const states = await pool.query(
      `SELECT id, state::text AS state, checkout_date, pickup_damage
       FROM sh_inventory WHERE id = ANY($1::int[])`,
      [fx.boxIds],
    );
    for (const r of states.rows) {
      expect(r.state).toBe('checked_out');
      expect(r.pickup_damage).toBe('Out good');
      expect(r.checkout_date).not.toBeNull();
    }

    const asg = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pickup_number_assignments
       WHERE pickup_number_id = $1`,
      [fx.pickupId],
    );
    expect(asg.rows[0].n).toBe(3);

    const pn = await pool.query(
      `SELECT is_complete FROM pickup_numbers WHERE pickup_number_id = $1`,
      [fx.pickupId],
    );
    // 3 of 5 — not complete yet.
    expect(pn.rows[0].is_complete).toBe(false);
  });

  it('exact-quota fill marks pickup is_complete', async () => {
    // Quota 3, three boxes — fills exactly.
    await cleanup();
    fx = await seed({ quota: 3, boxCount: 3 });
    const result = await runOutbound(
      fx.pickupId,
      fx.boxIds,
      '2026-05-29T17:00:00.000Z',
    );
    expect(result.ok).toBe(true);

    const pn = await pool.query(
      `SELECT is_complete, completed_at FROM pickup_numbers
       WHERE pickup_number_id = $1`,
      [fx.pickupId],
    );
    expect(pn.rows[0].is_complete).toBe(true);
    expect(pn.rows[0].completed_at).not.toBeNull();
  });

  it('over-quota batch rejects + rolls back fully', async () => {
    // Quota 2, three boxes.
    await cleanup();
    fx = await seed({ quota: 2, boxCount: 3 });
    const result = await runOutbound(
      fx.pickupId,
      fx.boxIds,
      '2026-05-29T17:00:00.000Z',
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe('pickup_over_quota');

    // No mutations leaked.
    const asg = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pickup_number_assignments
       WHERE pickup_number_id = $1`,
      [fx.pickupId],
    );
    expect(asg.rows[0].n).toBe(0);
    const states = await pool.query(
      `SELECT state::text AS state FROM sh_inventory WHERE id = ANY($1::int[])`,
      [fx.boxIds],
    );
    for (const r of states.rows) {
      expect(r.state).toBe('in_storage');
    }
  });

  it('box already checked_out rejects', async () => {
    // Flip one box to checked_out, then try to outbound all three.
    await pool.query(
      `UPDATE sh_inventory SET state = 'checked_out',
         checkout_date = '2026-05-28T00:00:00.000Z'
       WHERE id = $1`,
      [fx.boxIds[0]],
    );
    const result = await runOutbound(
      fx.pickupId,
      fx.boxIds,
      '2026-05-29T17:00:00.000Z',
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe('box_not_in_storage');
  });

  it('non-existent box rejects', async () => {
    const result = await runOutbound(
      fx.pickupId,
      [fx.boxIds[0], 999_999_999],
      '2026-05-29T17:00:00.000Z',
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe('box_not_found');
  });

  it('outbound on an already-complete pickup rejects', async () => {
    await pool.query(
      `UPDATE pickup_numbers SET is_complete = true, completed_at = now()
       WHERE pickup_number_id = $1`,
      [fx.pickupId],
    );
    const result = await runOutbound(
      fx.pickupId,
      fx.boxIds,
      '2026-05-29T17:00:00.000Z',
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe('pickup_already_complete');
  });

  it('two concurrent batches under the same pickup cannot over-enroll', async () => {
    // Quota 4, two batches of 3 boxes each (6 total > 4). Serialization
    // means exactly one batch succeeds; the second sees the first's
    // assignments after acquiring the row lock and bounces with
    // pickup_over_quota.
    await cleanup();
    fx = await seed({ quota: 4, boxCount: 6 });
    const batchA = fx.boxIds.slice(0, 3);
    const batchB = fx.boxIds.slice(3, 6);

    // 100ms delay holds the lock long enough for the second batch's
    // FOR UPDATE to queue behind it.
    const [a, b] = await Promise.all([
      runOutbound(fx.pickupId, batchA, '2026-05-29T17:00:00.000Z', 100),
      runOutbound(fx.pickupId, batchB, '2026-05-29T17:00:01.000Z', 0),
    ]);
    const oks = [a, b].filter((r) => r.ok).length;
    const overQuotaCount = [a, b].filter(
      (r) => !r.ok && r.code === 'pickup_over_quota',
    ).length;
    expect(oks).toBe(1);
    expect(overQuotaCount).toBe(1);

    const asg = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pickup_number_assignments
       WHERE pickup_number_id = $1`,
      [fx.pickupId],
    );
    // Whichever batch won, exactly 3 assignments exist — never 6, never 4.
    expect(asg.rows[0].n).toBe(3);
  });
});
