// Shared types mirrored from the client-side template types so the
// server can construct resolved data objects with type safety.
//
// Keep these in lock-step with:
//   client/src/components/templates/delivery/types.ts
//   client/src/components/templates/io-report/types.ts
//   client/src/components/templates/pnl/types.ts
//   client/src/components/templates/sh-statement/types.ts
//
// Duplicating rather than re-exporting because the server side can't
// import from client/ — the bundles run in different module realms.

export interface DeliveryData {
  delivery_id: number | string;
  generated_at: string;
  delivery_date: string | null;
  customer: {
    business_name: string | null;
    client_name: string;
    contact_phone: string | null;
    contact_email: string | null;
  };
  delivery_address: {
    name: string | null;
    street: string | null;
    locality: string | null;
  };
  container: {
    unit_number: string;
    size: string;
    damage: string | null;
    release_number_value: string | null;
    sale_company_name: string | null;
    receipt_summary: string;
  };
  delivery_company: string | null;
  onsite_contact: string | null;
  door_orientation: string | null;
  payment_details: string | null;
  receipt_note: string | null;
  notes: string | null;
}

export type IOReportSource = 'sales' | 'sh';

export interface IOReportRow {
  unit_number: string;
  size: string;
  date: string;
  party: string;
  release_number_value?: string | null;
  source: IOReportSource;
}

export interface IOReportData {
  report_id: number | string;
  generated_at: string;
  start_date: string;
  end_date: string;
  inbound: IOReportRow[];
  outbound: IOReportRow[];
}

export interface PnLData {
  report_id: number | string;
  generated_at: string;
  period_label: string;
  granularity: 'month' | 'quarter' | 'year';
  sales: {
    revenue: number;
    cost: number;
    mod_revenue: number;
    mod_cost: number;
    trucking: number;
    container_count: number;
  };
  sh: {
    revenue: number;
    in_fee: number;
    out_fee: number;
    storage_days: number;
    client_count: number;
  };
  null_cost_count?: number;
}

export interface ShStatementLine {
  billing_month: string;
  invoice_number: number;
  status: 'pending_review' | 'sent' | 'paid';
  in_fee: number;
  out_fee: number;
  storage_days: number;
  total: number;
}

export interface ShStatementData {
  report_id: number | string;
  generated_at: string;
  start_date: string | null;
  end_date: string | null;
  client: {
    business_name: string | null;
    client_name: string;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    contact_phone: string | null;
    contact_email: string | null;
  };
  lines: ShStatementLine[];
  totals: {
    in_fee: number;
    out_fee: number;
    storage_days: number;
    total: number;
  };
}

export interface ReleaseSummaryContainer {
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

export interface ReleaseSummaryData {
  report_id: number | string;
  generated_at: string;
  release_number_value: string;
  sale_company_name: string;
  /** Total boxes the release was opened for (release_numbers.release_number_count). */
  quota: number;
  /** Count of inventory rows currently pointing at this release. Sold/outbound boxes still count. */
  filled_count: number;
  /** quota - filled_count, clamped at zero. */
  remaining: number;
  is_complete: boolean;
  completed_at: string | null;
  containers: ReleaseSummaryContainer[];
}

export type ResolvedReportData =
  | { report_type: 'delivery_sheet'; data: DeliveryData }
  | { report_type: 'io_report'; data: IOReportData }
  | { report_type: 'pnl'; data: PnLData }
  | { report_type: 'sh_statement'; data: ShStatementData }
  | { report_type: 'release_summary'; data: ReleaseSummaryData };

// db/index.js is plain JS and its `query` return is inferred imprecisely
// (the `pool.query` overload set lands on QueryArrayResult, making
// `.rows` look like `any[][]`). This helper narrows result.rows to the
// caller's row type without going through `as unknown as T[]` at every
// callsite.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowsOf<T>(result: any): T[] {
  return (result.rows ?? []) as T[];
}
