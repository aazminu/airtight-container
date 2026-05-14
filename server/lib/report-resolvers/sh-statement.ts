import db from '../../db/index.js';
import {
  rowsOf,
  type ShStatementData,
  type ShStatementLine,
} from './types.js';

// Per-client S&H statement resolver.
//
// Joins sh_invoices + sh_invoice_lines for one client over an optional
// date window (filter on sh_invoices.billing_month). Each row in
// `lines` represents one monthly invoice, with the line-type amounts
// summed up by type.

export interface ShStatementParams {
  client_id: number;
  start_date?: string;
  end_date?: string;
}

const NUM = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function resolveShStatement(
  params: ShStatementParams,
  reportId: number,
): Promise<ShStatementData> {
  // Client header
  const clientRes = await db.query(
    `SELECT id, client_name, business_name, contact_phone, contact_email,
            street, city, state, zip
     FROM clients
     WHERE id = $1`,
    [params.client_id],
  );
  const clientRows = rowsOf<{
    id: number;
    client_name: string;
    business_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  }>(clientRes);
  if (clientRows.length === 0) {
    throw new Error(`Client ${params.client_id} not found`);
  }
  const cl = clientRows[0];

  // Pull invoices + per-line-type totals in one query.
  const filters: string[] = ['shi.client_id = $1'];
  const args: unknown[] = [params.client_id];
  if (params.start_date) {
    args.push(params.start_date);
    filters.push(`shi.billing_month >= $${args.length}`);
  }
  if (params.end_date) {
    args.push(params.end_date);
    filters.push(`shi.billing_month <= $${args.length}`);
  }

  const sql = `
    SELECT
      shi.id                                    AS sh_invoice_id,
      shi.billing_month::text                   AS billing_month,
      shi.invoice_number                        AS invoice_number,
      shi.status                                AS status,
      COALESCE(SUM(CASE WHEN shl.line_type = 'in_fee'       THEN shl.amount::numeric END), 0) AS in_fee,
      COALESCE(SUM(CASE WHEN shl.line_type = 'out_fee'      THEN shl.amount::numeric END), 0) AS out_fee,
      COALESCE(SUM(CASE WHEN shl.line_type = 'storage_days' THEN shl.amount::numeric END), 0) AS storage_days,
      COALESCE(SUM(shl.amount::numeric), 0)     AS total
    FROM sh_invoices shi
    LEFT JOIN sh_invoice_lines shl ON shl.sh_invoice_id = shi.id
    WHERE ${filters.join(' AND ')}
    GROUP BY shi.id, shi.billing_month, shi.invoice_number, shi.status
    ORDER BY shi.billing_month
  `;
  const lineRes = await db.query(sql, args);
  const lineRows = rowsOf<{
    sh_invoice_id: number;
    billing_month: string;
    invoice_number: number;
    status: ShStatementLine['status'];
    in_fee: string | null;
    out_fee: string | null;
    storage_days: string | null;
    total: string | null;
  }>(lineRes);

  const lines: ShStatementLine[] = lineRows.map((r) => ({
    billing_month: r.billing_month,
    invoice_number: r.invoice_number,
    status: r.status,
    in_fee: NUM(r.in_fee),
    out_fee: NUM(r.out_fee),
    storage_days: NUM(r.storage_days),
    total: NUM(r.total),
  }));

  const totals = lines.reduce(
    (acc, l) => ({
      in_fee: acc.in_fee + l.in_fee,
      out_fee: acc.out_fee + l.out_fee,
      storage_days: acc.storage_days + l.storage_days,
      total: acc.total + l.total,
    }),
    { in_fee: 0, out_fee: 0, storage_days: 0, total: 0 },
  );

  return {
    report_id: reportId,
    generated_at: new Date().toISOString(),
    start_date: params.start_date ?? null,
    end_date: params.end_date ?? null,
    client: {
      business_name: cl.business_name,
      client_name: cl.client_name,
      street: cl.street,
      city: cl.city,
      state: cl.state,
      zip: cl.zip,
      contact_phone: cl.contact_phone,
      contact_email: cl.contact_email,
    },
    lines,
    totals,
  };
}
