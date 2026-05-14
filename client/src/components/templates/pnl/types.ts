// Profit + Loss for a given period. Server resolver aggregates over
// sold/invoices for sales and sh_invoice_lines for S&H. Pending-review
// S&H invoices DO count toward revenue (per owner decision).
//
// Containers with NULL acquisition_price are excluded from the cost
// calc and surfaced via `nulls_footnote` so the operator can see the
// number is incomplete.

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
  /** Containers sold in the period whose acquisition_price is NULL.
   *  Excluded from the cost calc; rendered as a footnote so the
   *  reader knows the cost number is incomplete. */
  null_cost_count?: number;
}
