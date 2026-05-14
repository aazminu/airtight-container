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

export interface PnlBreakdownRow {
  container_id: number;
  unit_number: string;
  intake_date: string | null;
  size: string | null;
  damage: string | null;
  acquisition_price: number | null;
  sale_price: number | null;
  material_cost: number;
  labor_cost: number;
  trucking_rate: number;
  mod_revenue: number;
  invoice_id: number;
  invoice_number: number | null;
  invoice_date: string | null;
  client_name: string | null;
  business_name: string | null;
}

export async function resolvePnlBreakdown(
  params: PnlParams,
): Promise<PnlBreakdownRow[]> {
  const { start, end_exclusive } = resolvePeriod(
    params.granularity,
    params.period,
  );
  const sql = `
    SELECT
      inv.id                                  AS container_id,
      TRIM(inv.unit_number)                   AS unit_number,
      inv.date                                AS intake_date,
      inv.size                                AS size,
      inv.damage                              AS damage,
      inv.acquisition_price                   AS acquisition_price,
      s.sale_price                            AS sale_price,
      COALESCE(s.material_cost, 0)            AS material_cost,
      COALESCE(s.labor_cost, 0)               AS labor_cost,
      COALESCE(s.trucking_rate, 0)            AS trucking_rate,
      COALESCE((
        SELECT SUM(sm.price::numeric)
        FROM sold_modifications sm
        WHERE sm.sold_id = s.id
      ), 0)                                   AS mod_revenue,
      i.invoice_id                            AS invoice_id,
      i.invoice_number                        AS invoice_number,
      i.invoice_date                          AS invoice_date,
      c.client_name                           AS client_name,
      c.business_name                         AS business_name
    FROM invoices i
    JOIN invoice_containers ic ON ic.invoice_id = i.invoice_id
    JOIN inventory inv         ON inv.id = ic.container_id
    LEFT JOIN sold s           ON s.inventory_id = inv.id
    LEFT JOIN clients c        ON c.id = i.client_id
    WHERE i.invoice_date >= $1 AND i.invoice_date < $2
    ORDER BY i.invoice_date DESC, inv.unit_number
  `;
  const result = await db.query(sql, [start, end_exclusive]);
  const rows = rowsOf<{
    container_id: number;
    unit_number: string;
    intake_date: Date | null;
    size: string | null;
    damage: string | null;
    acquisition_price: string | null;
    sale_price: string | null;
    material_cost: string | null;
    labor_cost: string | null;
    trucking_rate: string | null;
    mod_revenue: string | null;
    invoice_id: number;
    invoice_number: number | null;
    invoice_date: Date | null;
    client_name: string | null;
    business_name: string | null;
  }>(result);
  return rows.map((r) => ({
    container_id: r.container_id,
    unit_number: r.unit_number,
    intake_date: r.intake_date ? new Date(r.intake_date).toISOString() : null,
    size: r.size,
    damage: r.damage,
    acquisition_price: r.acquisition_price == null ? null : NUM(r.acquisition_price),
    sale_price: r.sale_price == null ? null : NUM(r.sale_price),
    material_cost: NUM(r.material_cost),
    labor_cost: NUM(r.labor_cost),
    trucking_rate: NUM(r.trucking_rate),
    mod_revenue: NUM(r.mod_revenue),
    invoice_id: r.invoice_id,
    invoice_number: r.invoice_number,
    invoice_date: r.invoice_date ? new Date(r.invoice_date).toISOString() : null,
    client_name: r.client_name,
    business_name: r.business_name,
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
