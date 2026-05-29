// Shape returned by /api/v2/quote and /api/v2/quote/:id after
// groupQuotes() in server/routes/v2/quote.js. Numeric columns come back
// as strings from pg (Postgres `numeric` is preserved as a string to
// avoid precision loss). Templates parse with Number() at display time.

export interface QuoteCustomer {
  id: number;
  client_name: string;
  business_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface QuoteModification {
  id: number;
  quote_line_item_id: number;
  description: string;
  price: string;
  position: number;
}

export interface QuoteLine {
  id: number;
  description: string;
  sale_price: string | null;
  trucking_rate: string | null;
  destination: string | null;
  position: number;
  modifications: QuoteModification[];
}

export type QuoteStatus = 'draft' | 'sent';

export const QUOTE_STATUSES: readonly QuoteStatus[] = ['draft', 'sent'] as const;

export interface QuoteData {
  id: number;
  // Accepts string for the create-flow preview, which shows a
  // placeholder until the server assigns the real QYYYYMM### number.
  quote_number: string;
  quote_taxed: boolean;
  quote_credit: boolean;
  created_at: string;
  notes: string | null;
  status: QuoteStatus;
  sent_at: string | null;
  pdf_s3_key: string | null;
  // Soft-delete marker. Non-null = the quote was deleted; its number is
  // retained so the month's sequence stays contiguous.
  deleted_at: string | null;
  subtotal: string | null;
  tax_rate: string | null;
  tax_amount: string | null;
  cc_fee_rate: string | null;
  cc_fee_amount: string | null;
  total: string | null;
  customer: QuoteCustomer;
  lines: QuoteLine[];
}

export interface QuoteTemplateProps {
  data: QuoteData;
}
