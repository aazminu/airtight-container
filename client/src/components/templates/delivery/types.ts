// Data the DeliveryTemplate renders. PR 5.3 will resolve this server-
// side: container + customer + modifications come from sold +
// inventory + clients + sold_modifications joins; the remaining fields
// (delivery_company, onsite_contact, door_orientation, payment_details,
// receipt_note default, delivery_address override) are operator-entered
// at generation time and persisted in reports.parameters jsonb.

export interface DeliveryData {
  /** Display id (e.g. 'D-202604009'); appears in the meta block. */
  delivery_id: number | string;
  generated_at: string;
  /** Day + time the box is going out. Datetime so the template can show
   *  both date and clock time, the way the legacy doc did. */
  delivery_date: string | null;

  /** Customer of record (from the clients table). Renders as the
   *  recipient identity in the parties block. */
  customer: {
    business_name: string | null;
    client_name: string;
    contact_phone: string | null;
    contact_email: string | null;
  };

  /** Where the container is actually being delivered. May differ from
   *  the customer's billing address; the generator form auto-fills
   *  this from clients but lets the operator override (the legacy doc
   *  warned: "Auto-Filled Address MAY NOT BE Delivery Address"). */
  delivery_address: {
    name: string | null;       // recipient name on site (may differ from customer.client_name)
    street: string | null;
    locality: string | null;   // "City, State Zip" pre-formatted for a single line
  };

  /** The single container being delivered. */
  container: {
    unit_number: string;
    size: string;
    damage: string | null;
    release_number_value: string | null;
    sale_company_name: string | null;
    /** Short receipt-summary line. Legacy used "1 40' Weather Tight
     *  Container" verbatim. PR 5.3 resolver computes from size; the
     *  operator can override at form time. */
    receipt_summary: string;
  };

  /** Carrier doing this delivery. Operator-entered at form time. Not
   *  the same as inventory.trucking_company (that was inbound). */
  delivery_company: string | null;

  /** On-site contact: name + phone of whoever the driver meets. Often
   *  different from the customer of record. */
  onsite_contact: string | null;

  /** "Doors facing road", "doors at rear", etc. Critical for placement. */
  door_orientation: string | null;

  /** How (and whether) the driver collects payment on delivery. */
  payment_details: string | null;

  /** Free-text receipt note. Defaults to sold.invoice_notes at form
   *  time; operator can override. Rendered as the top "DELIVERY
   *  RECEIPT:" line on the legacy doc. */
  receipt_note: string | null;

  /** Extra free-text notes section below the form fields. */
  notes: string | null;
}
