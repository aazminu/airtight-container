// Profit + Loss for a given period. PR 5.3 server resolver will
// aggregate over sold/invoices for sales + sh_invoice_lines for S&H.

export interface PnLData {
  report_id: number | string;
  generated_at: string;
  /** Human-readable period label, e.g. "March 2026" or "Q1 2026" or "2025". */
  period_label: string;
  /** Used for the meta block and any computations the template needs. */
  granularity: 'month' | 'quarter' | 'year';
  sales: {
    revenue: number;
    cost: number;
    /** Modification revenue (charged on invoices). */
    mod_revenue: number;
    /** Modification cost (material + labor). */
    mod_cost: number;
    /** Trucking pass-through; not a profit line, just informational. */
    trucking: number;
    /** Number of containers sold in the period. */
    container_count: number;
  };
  sh: {
    /** Sum of sh_invoice_lines.amount across in_fee + out_fee + storage_days. */
    revenue: number;
    in_fee: number;
    out_fee: number;
    storage_days: number;
    /** Distinct S&H clients with activity in the period. */
    client_count: number;
  };
}
