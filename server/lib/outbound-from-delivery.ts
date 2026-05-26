// PR 9.7: outbound state-flip driven by delivery-sheet date.
//
// Rules:
//   - Trigger source: delivery_sheet reports' resolved_data.delivery_date.
//     When that date is in the past or today and the linked container
//     is still in 'sold' state, flip inventory.state → 'outbound'.
//   - One-way. A box that's already 'outbound' stays 'outbound'
//     regardless of subsequent delivery-sheet date edits — physical
//     boxes that have left the yard don't come back.
//   - Idempotent. Re-running the function on already-outbound rows
//     is a no-op.
//   - Sales-only. S&H boxes have their own lifecycle (in_storage →
//     checked_out via /api/v2/sh-inventory routes); we don't conflate
//     domains. delivery_sheet reports against sh_box_id are skipped
//     by this routine.
//   - Side effect: keeps sold.outbound_date in sync with the most
//     recent delivery-sheet date for each container that flips. The
//     legacy /api/v1/inventory join surfaces this column on the
//     /inventory Sold tab; without the update, the date appears
//     blank even after the state flips.
//
// Triggered from three places:
//   1. Eager on report create + regenerate (scoped to one container)
//   2. Daily cron at 05:00 ET (covers future-dated rows as they
//      come due)
//   3. One-shot backfill in migration 0013 (already-past dates that
//      pre-date this routine)

import type { PoolClient } from 'pg';
import db from '../db/index.js';

export interface ApplyResult {
  flipped: number;
  /** Inventory IDs that transitioned sold → outbound this run. */
  flipped_ids: number[];
}

// Shared SELECT body. The two callers (sweep-all + scope-to-one)
// append their own WHERE clause + GROUP BY tail.
const SQL_FLIPPABLE_BODY = `
  FROM reports r
  JOIN inventory inv
    ON inv.id = (r.parameters->>'container_id')::int
  WHERE r.report_type = 'delivery_sheet'
    AND r.parameters ? 'container_id'
    AND inv.state = 'sold'
    AND COALESCE(
          (r.resolved_data->>'delivery_date')::timestamptz,
          (r.parameters->>'delivery_date')::timestamptz
        ) <= NOW()
`;

const SQL_SELECT_HEAD = `
  SELECT
    inv.id AS inventory_id,
    -- Most recent delivery-sheet date for this container, in case
    -- there are multiple reports against the same box (e.g. operator
    -- re-resolved or generated a second sheet).
    MAX(
      COALESCE(
        (r.resolved_data->>'delivery_date')::timestamptz,
        (r.parameters->>'delivery_date')::timestamptz
      )
    ) AS delivery_date
`;

async function runQuery<T extends Record<string, unknown>>(
  client: PoolClient | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const out = client
    ? await client.query(sql, params)
    : await db.query(sql, params);
  return (out.rows ?? []) as T[];
}

interface FlippableRow {
  inventory_id: number;
  delivery_date: string;
}

/**
 * Scan all delivery-sheet reports and flip 'sold' containers whose
 * sheet date is now in the past. Idempotent. Pass `containerId` to
 * scope to a single inventory row (the eager-after-create path);
 * pass nothing to sweep the whole table (the cron + backfill path).
 */
export async function applyOutboundFromDeliverySheets(
  opts: { containerId?: number; client?: PoolClient } = {},
): Promise<ApplyResult> {
  const { containerId, client = null } = opts;

  const sql =
    containerId == null
      ? `${SQL_SELECT_HEAD} ${SQL_FLIPPABLE_BODY} GROUP BY inv.id`
      : `${SQL_SELECT_HEAD} ${SQL_FLIPPABLE_BODY} AND inv.id = $1 GROUP BY inv.id`;
  const rows = await runQuery<FlippableRow>(
    client,
    sql,
    containerId == null ? [] : [containerId],
  );

  if (rows.length === 0) return { flipped: 0, flipped_ids: [] };

  const ids = rows.map((r) => r.inventory_id);

  // Flip state + update legacy sold.outbound_date in one transaction.
  // We don't take a new connection if the caller passed one in (this
  // routine is also called from inside route handlers that already
  // own a tx).
  const exec = async (c: PoolClient | null, sql: string, params: unknown[]) =>
    c ? c.query(sql, params) : db.query(sql, params);

  await exec(
    client,
    `UPDATE inventory
        SET state = 'outbound'
      WHERE id = ANY($1::int[]) AND state = 'sold'`,
    [ids],
  );

  // Sync sold.outbound_date to the most-recent delivery date for each
  // flipped row. We update one-by-one — there are ~5-20 of these per
  // sweep at worst, the bulk-UPDATE-with-CTE alternative is more
  // surface area than it's worth.
  for (const r of rows) {
    await exec(
      client,
      `UPDATE sold
          SET outbound_date = $1
        WHERE inventory_id = $2 AND outbound_date IS DISTINCT FROM $1`,
      [r.delivery_date, r.inventory_id],
    );
  }

  return { flipped: ids.length, flipped_ids: ids };
}
