// Data the DeliveryTemplate renders. PR 5.3 will populate this from
// the server resolver (joining inventory + sold + clients + sale_companies
// + release_numbers for a single sold container). For PR 5.2 the preview
// route synthesizes a realistic instance.

export interface DeliveryData {
  /** Internal id; appears in the meta block and the S3 key. */
  delivery_id: number | string;
  generated_at: string;
  outbound_date: string | null;
  /** Customer block on the "TO" side of the parties row. */
  customer: {
    business_name: string | null;
    client_name: string;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    contact_phone: string | null;
    contact_email: string | null;
  };
  /** The single container being delivered. */
  container: {
    unit_number: string;
    size: string;
    damage: string | null;
    release_number_value: string | null;
    sale_company_name: string | null;
  };
  /** Where the box is going. Most prominent line on the sheet. */
  destination: string;
  /** Trucker delivering the box (driver line). */
  trucker: string | null;
  /** Optional list of mods to call out on the sheet. */
  modifications: { description: string; price: number | string | null }[];
  notes: string | null;
}
