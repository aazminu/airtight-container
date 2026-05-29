// Per-release summary. Server resolver counts every inventory row
// pointing at the release (sold/outbound still count toward filled).

export interface ReleaseSummaryContainer {
  /** 'sales' for inventory boxes, 'sh' for stored boxes (migration 0021). */
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

export interface ReleaseSummaryData {
  report_id: number | string;
  generated_at: string;
  release_number_value: string;
  sale_company_name: string;
  /** Total boxes the release was opened for. */
  quota: number;
  /** Count of inventory rows currently pointing at this release. */
  filled_count: number;
  /** quota - filled_count, clamped at zero. */
  remaining: number;
  is_complete: boolean;
  completed_at: string | null;
  containers: ReleaseSummaryContainer[];
}
