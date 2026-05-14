// Inbound/outbound activity over a date window. The resolver pulls
// from two sources (sales releases + S&H box check-ins for inbound;
// sold container deliveries + S&H pickups for outbound) and tags each
// row with `source` so the template can group them under sub-headers.

export type IOReportSource = 'sales' | 'sh';

export interface IOReportRow {
  unit_number: string;
  size: string;
  date: string;
  /** For inbound: sale_company_name (sales) or client_name (sh).
   *  For outbound: client_name + destination (sales) or client_name (sh). */
  party: string;
  /** Optional release number for inbound sales rows. */
  release_number_value?: string | null;
  /** Which sub-section this row belongs to. The template groups rows
   *  by source and renders a delimiter between them. */
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
