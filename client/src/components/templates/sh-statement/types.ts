// Per-client Storage & Handling statement. PR 5.3 server resolver
// aggregates sh_invoices + sh_invoice_lines for one client over a
// date window.

export interface ShStatementLine {
  /** Billing month (first of month). */
  billing_month: string;
  invoice_number: number;
  status: 'pending_review' | 'sent' | 'paid';
  /** Sums per line_type from sh_invoice_lines for that invoice. */
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
  /** Sums across all lines. */
  totals: {
    in_fee: number;
    out_fee: number;
    storage_days: number;
    total: number;
  };
}
