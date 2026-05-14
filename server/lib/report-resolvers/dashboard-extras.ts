import db from '../../db/index.js';
import { rowsOf } from './types.js';
import { resolvePeriod, type PnlParams } from './pnl.js';

// Dashboard-only resolvers — these power the live panel and never get
// persisted into the reports table. Keep them quick and indexed.

const NUM = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface TopClientRow {
  client_id: number;
  client_name: string;
  business_name: string | null;
  invoice_count: number;
  container_count: number;
  revenue: number;
}

export async function resolveTopClients(
  params: PnlParams,
  limit: number,
): Promise<TopClientRow[]> {
  const { start, end_exclusive } = resolvePeriod(
    params.granularity,
    params.period,
  );
  // Aggregate invoice subtotals per client. DISTINCT on subtotal would
  // collapse legit ties, so we aggregate distinct invoice_ids first then
  // pull subtotal from the inner row.
  const sql = `
    WITH client_invoices AS (
      SELECT
        i.client_id,
        i.invoice_id,
        i.subtotal::numeric AS subtotal
      FROM invoices i
      WHERE i.invoice_date >= $1 AND i.invoice_date < $2
    ),
    client_containers AS (
      SELECT
        i.client_id,
        ic.container_id
      FROM invoices i
      JOIN invoice_containers ic ON ic.invoice_id = i.invoice_id
      WHERE i.invoice_date >= $1 AND i.invoice_date < $2
      GROUP BY i.client_id, ic.container_id
    )
    SELECT
      c.id                                  AS client_id,
      c.client_name                         AS client_name,
      c.business_name                       AS business_name,
      COALESCE(ci.invoice_count, 0)         AS invoice_count,
      COALESCE(cc.container_count, 0)       AS container_count,
      COALESCE(ci.revenue, 0)               AS revenue
    FROM clients c
    LEFT JOIN (
      SELECT client_id, COUNT(*)::int AS invoice_count, SUM(subtotal) AS revenue
      FROM client_invoices
      GROUP BY client_id
    ) ci ON ci.client_id = c.id
    LEFT JOIN (
      SELECT client_id, COUNT(*)::int AS container_count
      FROM client_containers
      GROUP BY client_id
    ) cc ON cc.client_id = c.id
    WHERE COALESCE(ci.revenue, 0) > 0
    ORDER BY revenue DESC NULLS LAST, c.client_name
    LIMIT $3
  `;
  const result = await db.query(sql, [start, end_exclusive, limit]);
  const rows = rowsOf<{
    client_id: number;
    client_name: string;
    business_name: string | null;
    invoice_count: number;
    container_count: number;
    revenue: string | null;
  }>(result);
  return rows.map((r) => ({
    client_id: r.client_id,
    client_name: r.client_name,
    business_name: r.business_name,
    invoice_count: r.invoice_count,
    container_count: r.container_count,
    revenue: NUM(r.revenue),
  }));
}

export interface YardBucket {
  key: string;
  count: number;
}

export interface YardSnapshot {
  total: number;
  by_state: YardBucket[];
  by_size: YardBucket[];
  pending_audit: number;
  flagged_damage: number;
}

export async function resolveYardSnapshot(): Promise<YardSnapshot> {
  const stateSql = `
    SELECT state AS key, COUNT(*)::int AS count
    FROM inventory
    GROUP BY state
    ORDER BY count DESC
  `;
  const sizeSql = `
    SELECT size AS key, COUNT(*)::int AS count
    FROM inventory
    WHERE size IS NOT NULL AND size <> ''
    GROUP BY size
    ORDER BY count DESC
  `;
  const totalSql = `SELECT COUNT(*)::int AS n FROM inventory`;
  const pendingSql = `
    SELECT COUNT(*)::int AS n FROM inventory WHERE is_pending_audit = true
  `;
  const damageSql = `
    SELECT COUNT(*)::int AS n FROM inventory
    WHERE damage IS NOT NULL
      AND damage <> ''
      AND damage NOT ILIKE 'wwt'
      AND damage NOT ILIKE 'cw'
  `;
  const [stateRes, sizeRes, totalRes, pendingRes, damageRes] = await Promise.all([
    db.query(stateSql, []),
    db.query(sizeSql, []),
    db.query(totalSql, []),
    db.query(pendingSql, []),
    db.query(damageSql, []),
  ]);
  const state = rowsOf<{ key: string; count: number }>(stateRes);
  const size = rowsOf<{ key: string; count: number }>(sizeRes);
  const total = rowsOf<{ n: number }>(totalRes)[0]?.n ?? 0;
  const pending = rowsOf<{ n: number }>(pendingRes)[0]?.n ?? 0;
  const damage = rowsOf<{ n: number }>(damageRes)[0]?.n ?? 0;
  return {
    total,
    by_state: state,
    by_size: size,
    pending_audit: pending,
    flagged_damage: damage,
  };
}
