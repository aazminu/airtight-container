// Inbound/outbound activity over a date window. PR 5.3 will populate
// this from a server resolver that queries inventory.date in range
// and sold.outbound_date in range.

export interface IOReportRow {
  unit_number: string;
  size: string;
  date: string;
  /** For inbound: sale_company_name. For outbound: client_name + destination. */
  party: string;
  /** Optional release number for inbound rows. */
  release_number_value?: string | null;
}

export interface IOReportData {
  report_id: number | string;
  generated_at: string;
  start_date: string;
  end_date: string;
  inbound: IOReportRow[];
  outbound: IOReportRow[];
}
