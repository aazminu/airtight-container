// Shape returned by /api/v2/invoice and /api/v2/invoice/:id after
// groupInvoices() in server/routes/v2/invoice.js. Numeric columns come
// back as strings from pg — Postgres `numeric` is preserved as a string
// to avoid precision loss. Templates parse with Number() at display time.

export interface InvoiceCustomer {
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

export interface InvoiceModification {
  id: number;
  sold_id: number;
  description: string;
  price: string;
  position: number;
}

export interface InvoiceLineContainer {
  inventory_id: number;
  sold_id: number | null;
  unit_number: string;
  state: string;
  size: string;
  damage: string;
  destination: string | null;
  trucking_rate: string | null;
  sale_price: string | null;
  modification_price: string | null;
  outbound_date: string | null;
  invoice_notes: string | null;
  // Per-container delivery (delivery epic). Round-tripped through the
  // editor so an invoice edit doesn't wipe them.
  outbound_trucking_company_id: number | null;
  door_orientation: string | null;
  delivery_name: string | null;
  delivery_street: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  modifications: InvoiceModification[];
}

export type InvoiceStatus =
  | 'draft'
  | 'awaiting'
  | 'paid'
  | 'delinquent'
  | 'cancelled';

export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'draft',
  'awaiting',
  'paid',
  'delinquent',
  'cancelled',
] as const;

export interface InvoiceData {
  invoice_id: number;
  // Accepts string for the create-flow preview which shows
  // "PLACEHOLDER" until the server assigns the real number.
  invoice_number: number | string;
  invoice_taxed: boolean;
  invoice_credit: boolean;
  invoice_date: string;
  sent_at: string | null;
  pdf_s3_key: string | null;
  // Soft-delete marker. Non-null = the invoice was deleted; its number
  // is retained so the YYYYMM sequence stays contiguous. The list page
  // surfaces these with a "Deleted" badge; the detail page renders a
  // tombstone view and hides edit/email/regenerate actions.
  deleted_at: string | null;
  // Lifecycle status (PR 10.1). Default 'draft' on creation; flips to
  // 'awaiting' when the invoice is first emailed. Operator clicks
  // drive all subsequent transitions.
  status: InvoiceStatus;
  status_changed_at: string | null;
  status_changed_by_user_id: string | null;
  subtotal: string | null;
  tax_rate: string | null;
  tax_amount: string | null;
  cc_fee_rate: string | null;
  cc_fee_amount: string | null;
  total: string | null;
  // Invoice-level ship-to (delivery epic). When ship_to_same_as_billing
  // the per-* fields are null and the customer's billing address is used.
  ship_to_same_as_billing: boolean;
  ship_to_name: string | null;
  ship_to_street: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
  customer: InvoiceCustomer;
  containers: InvoiceLineContainer[];
}

export interface InvoiceTemplateProps {
  data: InvoiceData;
}
