import db from '../../db/index.js';
import { rowsOf, type IOReportData, type IOReportRow } from './types.js';

// In/Out report resolver.
//
// Inbound = anything that arrived at the yard in the window:
//   - sales: inventory.date (containers received from depots),
//     party = sale_company_name, release_number_value attached.
//   - sh:   sh_inventory.intake_date (storage check-ins),
//     party = client_name.
//
// Outbound = anything that left the yard in the window:
//   - sales: sold.outbound_date,
//     party = "{client_name} · {destination}" when both present.
//   - sh:   sh_inventory.checkout_date,
//     party = client_name.
//
// The two source-types are tagged on each row so the template can
// render them as separate sub-sections under the same Inbound /
// Outbound heading.

export interface IoReportParams {
  start_date: string;
  end_date: string;
}

const SALES_INBOUND_SQL = `
  SELECT
    inv.unit_number,
    inv.size,
    inv.date::text       AS date,
    sco.sale_company_name AS party,
    rn.release_number_value
  FROM inventory inv
  LEFT JOIN release_numbers rn ON rn.release_number_id = inv.release_number_id
  LEFT JOIN sale_companies sco ON sco.sale_company_id = inv.sale_company_id
  WHERE inv.date >= $1 AND inv.date < ($2::date + INTERVAL '1 day')
  ORDER BY inv.date, inv.id
`;

const SH_INBOUND_SQL = `
  SELECT
    sh.unit_number,
    sh.size,
    sh.intake_date::text AS date,
    COALESCE(cl.business_name, cl.client_name) AS party
  FROM sh_inventory sh
  JOIN clients cl ON cl.id = sh.client_id
  WHERE sh.intake_date >= $1 AND sh.intake_date < ($2::date + INTERVAL '1 day')
  ORDER BY sh.intake_date, sh.id
`;

const SALES_OUTBOUND_SQL = `
  SELECT
    inv.unit_number,
    inv.size,
    s.outbound_date::text AS date,
    COALESCE(cl.business_name, cl.client_name) AS client_label,
    s.destination
  FROM sold s
  JOIN inventory inv ON inv.id = s.inventory_id
  LEFT JOIN invoice_containers ic ON ic.container_id = inv.id
  LEFT JOIN invoices i ON i.invoice_id = ic.invoice_id
  LEFT JOIN clients cl ON cl.id = i.client_id
  WHERE s.outbound_date IS NOT NULL
    AND s.outbound_date >= $1
    AND s.outbound_date < ($2::date + INTERVAL '1 day')
  ORDER BY s.outbound_date, s.id
`;

const SH_OUTBOUND_SQL = `
  SELECT
    sh.unit_number,
    sh.size,
    sh.checkout_date::text AS date,
    COALESCE(cl.business_name, cl.client_name) AS party
  FROM sh_inventory sh
  JOIN clients cl ON cl.id = sh.client_id
  WHERE sh.checkout_date IS NOT NULL
    AND sh.checkout_date >= $1
    AND sh.checkout_date < ($2::date + INTERVAL '1 day')
  ORDER BY sh.checkout_date, sh.id
`;

interface SalesInRow {
  unit_number: string;
  size: string;
  date: string;
  party: string | null;
  release_number_value: string | null;
}
interface ShInRow { unit_number: string; size: string; date: string; party: string }
interface SalesOutRow {
  unit_number: string;
  size: string;
  date: string;
  client_label: string | null;
  destination: string | null;
}
interface ShOutRow { unit_number: string; size: string; date: string; party: string }

export async function resolveIoReport(
  params: IoReportParams,
  reportId: number,
): Promise<IOReportData> {
  const args = [params.start_date, params.end_date];
  const [salesInRes, shInRes, salesOutRes, shOutRes] = await Promise.all([
    db.query(SALES_INBOUND_SQL, args),
    db.query(SH_INBOUND_SQL, args),
    db.query(SALES_OUTBOUND_SQL, args),
    db.query(SH_OUTBOUND_SQL, args),
  ]);

  const salesInRows = rowsOf<SalesInRow>(salesInRes);
  const shInRows = rowsOf<ShInRow>(shInRes);
  const salesOutRows = rowsOf<SalesOutRow>(salesOutRes);
  const shOutRows = rowsOf<ShOutRow>(shOutRes);

  const inbound: IOReportRow[] = [
    ...salesInRows.map((r) => ({
      unit_number: r.unit_number,
      size: r.size,
      date: r.date,
      party: r.party ?? '—',
      release_number_value: r.release_number_value,
      source: 'sales' as const,
    })),
    ...shInRows.map((r) => ({
      unit_number: r.unit_number,
      size: r.size,
      date: r.date,
      party: r.party,
      source: 'sh' as const,
    })),
  ];

  const outbound: IOReportRow[] = [
    ...salesOutRows.map((r) => {
      const parts = [r.client_label, r.destination].filter(Boolean);
      return {
        unit_number: r.unit_number,
        size: r.size,
        date: r.date,
        party: parts.length > 0 ? parts.join(' · ') : '—',
        source: 'sales' as const,
      };
    }),
    ...shOutRows.map((r) => ({
      unit_number: r.unit_number,
      size: r.size,
      date: r.date,
      party: r.party,
      source: 'sh' as const,
    })),
  ];

  return {
    report_id: reportId,
    generated_at: new Date().toISOString(),
    start_date: params.start_date,
    end_date: params.end_date,
    inbound,
    outbound,
  };
}
