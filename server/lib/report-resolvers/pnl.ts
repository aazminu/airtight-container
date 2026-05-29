import db from '../../db/index.js';
import { rowsOf, type PnLData } from './types.js';

// P&L resolver.
//
// Sales side — driven by invoices.invoice_date in the period:
//   revenue       = SUM(invoices.subtotal)            (less tax + cc, those are pass-through)
//   cost          = SUM(inventory.acquisition_price)  across containers on those invoices
//   mod_revenue   = SUM(sold_modifications.price)
//   mod_cost      = SUM(sold.material_cost + sold.labor_cost)
//   trucking      = SUM(sold.trucking_rate)           (informational, not in profit)
//   container_count = COUNT(distinct containers)
//   null_cost_count = COUNT containers where acquisition_price IS NULL
//
// S&H side — driven by sh_invoices.billing_month in the period.
// Pending-review S&H invoices DO count toward revenue (owner decision):
// the month-end automation drafts them, the operator reviews + sends.
// Including pending matches accrual-style monthly reporting.
//   revenue       = SUM(sh_invoice_lines.amount)
//   in_fee/out_fee/storage_days = SUM per line_type
//   client_count  = COUNT(distinct sh_invoices.client_id)

const NUM = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface PnlParams {
  granularity: 'month' | 'quarter' | 'year';
  period: string;
}

interface PeriodWindow {
  start: string;        // 'YYYY-MM-DD' inclusive
  end_exclusive: string; // 'YYYY-MM-DD' exclusive
  label: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

// Step (granularity, period) backwards by N units. Used by the
// dashboard timeseries endpoint to build the period array.
export function previousPeriod(
  granularity: PnlParams['granularity'],
  period: string,
  steps = 1,
): string {
  if (granularity === 'month') {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) throw new Error(`Invalid month period: ${period}`);
    let year = parseInt(m[1], 10);
    let month = parseInt(m[2], 10) - steps;
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    return `${year}-${pad2(month)}`;
  }
  if (granularity === 'quarter') {
    const m = /^(\d{4})-Q([1-4])$/.exec(period);
    if (!m) throw new Error(`Invalid quarter period: ${period}`);
    let year = parseInt(m[1], 10);
    let q = parseInt(m[2], 10) - steps;
    while (q < 1) {
      q += 4;
      year -= 1;
    }
    while (q > 4) {
      q -= 4;
      year += 1;
    }
    return `${year}-Q${q}`;
  }
  if (granularity === 'year') {
    const m = /^(\d{4})$/.exec(period);
    if (!m) throw new Error(`Invalid year period: ${period}`);
    return `${parseInt(m[1], 10) - steps}`;
  }
  throw new Error(`Unsupported granularity: ${granularity}`);
}

export function resolvePeriod(
  granularity: PnlParams['granularity'],
  period: string,
): PeriodWindow {
  if (granularity === 'month') {
    // 'YYYY-MM'
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) throw new Error(`Invalid month period: ${period}`);
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (month < 1 || month > 12) throw new Error(`Invalid month: ${period}`);
    const start = `${year}-${pad2(month)}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const end = `${nextYear}-${pad2(nextMonth)}-01`;
    return { start, end_exclusive: end, label: `${MONTH_NAMES[month - 1]} ${year}` };
  }
  if (granularity === 'quarter') {
    // 'YYYY-Qn'
    const m = /^(\d{4})-Q([1-4])$/.exec(period);
    if (!m) throw new Error(`Invalid quarter period: ${period}`);
    const year = parseInt(m[1], 10);
    const q = parseInt(m[2], 10);
    const startMonth = (q - 1) * 3 + 1;
    const start = `${year}-${pad2(startMonth)}-01`;
    const endMonth = startMonth + 3;
    const endYear = endMonth > 12 ? year + 1 : year;
    const finalEndMonth = endMonth > 12 ? endMonth - 12 : endMonth;
    const end = `${endYear}-${pad2(finalEndMonth)}-01`;
    return { start, end_exclusive: end, label: `Q${q} ${year}` };
  }
  if (granularity === 'year') {
    const m = /^(\d{4})$/.exec(period);
    if (!m) throw new Error(`Invalid year period: ${period}`);
    const year = parseInt(m[1], 10);
    return {
      start: `${year}-01-01`,
      end_exclusive: `${year + 1}-01-01`,
      label: `${year}`,
    };
  }
  throw new Error(`Unsupported granularity: ${granularity}`);
}

export async function resolvePnL(
  params: PnlParams,
  reportId: number,
): Promise<PnLData> {
  const { start, end_exclusive, label } = resolvePeriod(
    params.granularity,
    params.period,
  );

  // ---- Sales aggregate ------------------------------------------------
  // One row per (invoice, container) so cost + mods + trucking can be
  // summed across the container set.
  const salesSql = `
    SELECT
      i.subtotal                                       AS invoice_subtotal,
      inv.id                                            AS container_id,
      inv.acquisition_price                             AS acquisition_price,
      s.material_cost                                   AS material_cost,
      s.labor_cost                                      AS labor_cost,
      s.trucking_rate                                   AS trucking_rate,
      (
        SELECT COALESCE(SUM(sm.price::numeric), 0)
        FROM sold_modifications sm
        WHERE sm.sold_id = s.id
      )                                                 AS mod_revenue
    FROM invoices i
    JOIN invoice_containers ic ON ic.invoice_id = i.invoice_id
    JOIN inventory inv         ON inv.id = ic.container_id
    LEFT JOIN sold s           ON s.inventory_id = inv.id
    WHERE i.invoice_date >= $1 AND i.invoice_date < $2
      AND i.deleted_at IS NULL
  `;
  const salesRes = await db.query(salesSql, [start, end_exclusive]);
  const salesRows = rowsOf<{
    invoice_subtotal: string | null;
    container_id: number;
    acquisition_price: string | null;
    material_cost: string | null;
    labor_cost: string | null;
    trucking_rate: string | null;
    mod_revenue: string | null;
    invoice_id?: number;
  }>(salesRes);

  // Distinct invoice subtotals (don't double-count when an invoice has
  // multiple containers). Build a map keyed by invoice_id.
  const invoiceSubtotalById = new Map<number, number>();
  const seenInvoiceContainer = new Set<string>();

  let cost = 0;
  let modCost = 0;
  let modRevenue = 0;
  let trucking = 0;
  let containerCount = 0;
  let nullCostCount = 0;

  for (const row of salesRows) {
    const containerId: number = row.container_id;
    // The query joins invoices→containers; if a container somehow
    // appears twice we'd double-count. invoice_containers has a UNIQUE
    // on container_id so this should be impossible, but defensive
    // dedupe is cheap.
    const key = `${row.invoice_id ?? '?'}-${containerId}`;
    if (seenInvoiceContainer.has(key)) continue;
    seenInvoiceContainer.add(key);

    containerCount += 1;
    if (row.acquisition_price == null) {
      nullCostCount += 1;
    } else {
      cost += NUM(row.acquisition_price);
    }
    modCost += NUM(row.material_cost) + NUM(row.labor_cost);
    modRevenue += NUM(row.mod_revenue);
    trucking += NUM(row.trucking_rate);
  }

  // Distinct invoice subtotals
  const distinctInvoicesSql = `
    SELECT invoice_id, COALESCE(subtotal::numeric, 0) AS subtotal
    FROM invoices
    WHERE invoice_date >= $1 AND invoice_date < $2
      AND deleted_at IS NULL
  `;
  const invoiceRes = await db.query(distinctInvoicesSql, [start, end_exclusive]);
  const invoiceRows = rowsOf<{ invoice_id: number; subtotal: string | null }>(
    invoiceRes,
  );
  for (const r of invoiceRows) {
    invoiceSubtotalById.set(r.invoice_id, NUM(r.subtotal));
  }
  // Revenue = sum of distinct invoice subtotals. Note: this includes
  // modification revenue too (it's baked into invoice subtotal). To
  // get the "container revenue only" line we subtract mod_revenue.
  let invoiceSubtotalSum = 0;
  for (const v of invoiceSubtotalById.values()) invoiceSubtotalSum += v;
  const revenue = invoiceSubtotalSum - modRevenue;

  // ---- S&H aggregate --------------------------------------------------
  // Pending-review invoices count toward revenue (owner decision).
  const shSql = `
    SELECT
      shl.line_type,
      COALESCE(SUM(shl.amount::numeric), 0) AS line_total
    FROM sh_invoices shi
    JOIN sh_invoice_lines shl ON shl.sh_invoice_id = shi.id
    WHERE shi.billing_month >= $1 AND shi.billing_month < $2
    GROUP BY shl.line_type
  `;
  const shRes = await db.query(shSql, [start, end_exclusive]);
  const shRows = rowsOf<{ line_type: string; line_total: string | null }>(shRes);

  let shInFee = 0;
  let shOutFee = 0;
  let shStorageDays = 0;
  for (const r of shRows) {
    const amt = NUM(r.line_total);
    if (r.line_type === 'in_fee') shInFee = amt;
    else if (r.line_type === 'out_fee') shOutFee = amt;
    else if (r.line_type === 'storage_days') shStorageDays = amt;
  }
  const shRevenue = shInFee + shOutFee + shStorageDays;

  const shClientRes = await db.query(
    `SELECT COUNT(DISTINCT client_id)::int AS n
     FROM sh_invoices
     WHERE billing_month >= $1 AND billing_month < $2`,
    [start, end_exclusive],
  );
  const shClientRows = rowsOf<{ n: number }>(shClientRes);
  const shClientCount = shClientRows[0]?.n ?? 0;

  return {
    report_id: reportId,
    generated_at: new Date().toISOString(),
    period_label: label,
    granularity: params.granularity,
    sales: {
      revenue,
      cost,
      mod_revenue: modRevenue,
      mod_cost: modCost,
      trucking,
      container_count: containerCount,
    },
    sh: {
      revenue: shRevenue,
      in_fee: shInFee,
      out_fee: shOutFee,
      storage_days: shStorageDays,
      client_count: shClientCount,
    },
    null_cost_count: nullCostCount > 0 ? nullCostCount : undefined,
  };
}
