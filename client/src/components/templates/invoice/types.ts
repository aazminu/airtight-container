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
  modifications: InvoiceModification[];
}

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
  subtotal: string | null;
  tax_rate: string | null;
  tax_amount: string | null;
  cc_fee_rate: string | null;
  cc_fee_amount: string | null;
  total: string | null;
  customer: InvoiceCustomer;
  containers: InvoiceLineContainer[];
}

export interface InvoiceTemplateProps {
  data: InvoiceData;
}
