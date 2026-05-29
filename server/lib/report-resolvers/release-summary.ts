import db from '../../db/index.js';
import { rowsOf, type ReleaseSummaryData } from './types.js';

// Release summary resolver.
//
// Per-release snapshot: which containers came in under this release
// number, what state they're in now, and how many slots in the quota
// are still unfilled. Sold/outbound boxes still count toward the
// "filled" total — once a box arrives under a release, it's logged
// even after sale.

export interface ReleaseSummaryParams {
  release_id: number;
}

interface ReleaseHeaderRow {
  release_number_id: number;
  release_number_value: string;
  release_number_count: number;
  is_complete: boolean;
  completed_at: string | null;
  sale_company_name: string;
}

interface InventoryRow {
  kind: 'sales' | 'sh';
  unit_number: string;
  size: string;
  damage: string | null;
  state: string;
  intake_date: string;
  outbound_date: string | null;
  destination: string | null;
  invoice_number: number | null;
  buyer_label: string | null;
}

export async function resolveReleaseSummary(
  params: ReleaseSummaryParams,
  reportId: number,
): Promise<ReleaseSummaryData> {
  const headerRes = await db.query(
    `SELECT rn.release_number_id, rn.release_number_value,
            rn.release_number_count, rn.is_complete, rn.completed_at,
            sc.sale_company_name
     FROM release_numbers rn
     JOIN sale_companies sc ON sc.sale_company_id = rn.sale_company_id
     WHERE rn.release_number_id = $1`,
    [params.release_id],
  );
  const headerRows = rowsOf<ReleaseHeaderRow>(headerRes);
  if (headerRows.length === 0) {
    throw new Error(`Release ${params.release_id} not found`);
  }
  const h = headerRows[0];

  // UNION sales + S&H boxes onto the same release. S&H rows project
  // their kind-specific fields onto the shared shape: checkout_date is
  // the "outbound", destination is null (S&H boxes don't ship out to a
  // destination — they're stored on yard for the client), invoice_number
  // is null (S&H boxes are billed monthly across many invoices, not
  // pinned to one), buyer_label is the client name.
  // Both sides cast `state` to text — `inventory.state` is the
  // `inventory_state` enum and `sh_inventory.state` is `sh_state`,
  // and UNION rejects mismatched column types.
  const invRes = await db.query(
    `(SELECT 'sales'::text AS kind,
             inv.unit_number, inv.size, inv.damage,
             inv.state::text AS state, inv.date AS intake_date,
             s.outbound_date, s.destination,
             i.invoice_number,
             COALESCE(cl.business_name, cl.client_name) AS buyer_label
       FROM inventory inv
       LEFT JOIN sold s ON s.inventory_id = inv.id
       LEFT JOIN invoice_containers ic ON ic.container_id = inv.id
       LEFT JOIN invoices i ON i.invoice_id = ic.invoice_id
       LEFT JOIN clients cl ON cl.id = i.client_id
       WHERE inv.release_number_id = $1)
     UNION ALL
     (SELECT 'sh'::text AS kind,
             shi.unit_number, shi.size, shi.damage,
             shi.state::text AS state,
             shi.intake_date,
             shi.checkout_date AS outbound_date,
             NULL::text AS destination,
             NULL::int AS invoice_number,
             COALESCE(shc.business_name, shc.client_name) AS buyer_label
       FROM sh_inventory shi
       LEFT JOIN clients shc ON shc.id = shi.client_id
       WHERE shi.release_number_id = $1)
     ORDER BY intake_date ASC`,
    [params.release_id],
  );
  const inventory = rowsOf<InventoryRow>(invRes);

  const filledCount = inventory.length;
  const quota = h.release_number_count;
  const remaining = Math.max(0, quota - filledCount);

  return {
    report_id: reportId,
    generated_at: new Date().toISOString(),
    release_number_value: h.release_number_value,
    sale_company_name: h.sale_company_name,
    quota,
    filled_count: filledCount,
    remaining,
    is_complete: h.is_complete,
    completed_at: h.completed_at,
    containers: inventory.map((r) => ({
      kind: r.kind,
      unit_number: r.unit_number,
      size: r.size,
      damage: r.damage,
      state: r.state,
      intake_date: r.intake_date,
      outbound_date: r.outbound_date,
      destination: r.destination,
      invoice_number: r.invoice_number,
      buyer_label: r.buyer_label,
    })),
  };
}
