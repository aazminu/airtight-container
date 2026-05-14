import db from '../../db/index.js';
import { rowsOf, type DeliveryData } from './types.js';

// Delivery sheet resolver.
//
// Happy path: container has an invoice. We join inventory → sold →
// invoice_containers → invoices → clients → release_numbers →
// sale_companies and pull customer + sold-row defaults.
//
// Edge path: container has no invoice yet (scheduled pickup before
// sale-close). The operator must supply `client_id` in the params;
// we skip the invoice join and load the client directly.
//
// Per-param overrides (delivery_date, delivery_company, onsite_contact,
// door_orientation, payment_details, receipt_note, receipt_summary,
// delivery_address.{name,street,locality}, notes) take precedence over
// resolved defaults when present.

export interface DeliverySheetParams {
  container_id: number;
  client_id?: number;
  delivery_date?: string;
  delivery_company?: string | null;
  onsite_contact?: string | null;
  door_orientation?: string | null;
  payment_details?: string | null;
  receipt_note?: string | null;
  receipt_summary?: string | null;
  delivery_address?: {
    name?: string | null;
    street?: string | null;
    locality?: string | null;
  };
  notes?: string | null;
}

interface ContainerRow {
  container_id: number;
  unit_number: string;
  size: string;
  damage: string | null;
  release_number_value: string | null;
  sale_company_name: string | null;
  sold_id: number | null;
  outbound_date: string | null;
  destination: string | null;
  invoice_notes: string | null;
  invoice_client_id: number | null;
}

interface ClientRow {
  id: number;
  client_name: string;
  business_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

function buildLocality(c: ClientRow): string | null {
  const cityState = [c.city, c.state].filter(Boolean).join(', ');
  const withZip = c.zip ? `${cityState} ${c.zip}`.trim() : cityState;
  return withZip || null;
}

function sizeDescriptor(size: string): string {
  // Trim padded values (legacy char(12) leaves trailing spaces on
  // some sizes) and condense to the "40' HC" / "20'" form used in
  // the legacy "1 40' Weather Tight Container" line.
  const t = size.trim();
  return t.replace(/\s+/g, ' ');
}

function derivedReceiptSummary(size: string): string {
  return `1 ${sizeDescriptor(size)} Weather Tight Container`;
}

export async function resolveDeliverySheet(
  params: DeliverySheetParams,
  reportId: number,
): Promise<DeliveryData> {
  // 1) Container + (optional) invoice join + release/sale_company.
  const containerSql = `
    SELECT
      inv.id              AS container_id,
      inv.unit_number,
      inv.size,
      inv.damage,
      rn.release_number_value,
      sco.sale_company_name,
      s.id                AS sold_id,
      s.outbound_date,
      s.destination,
      s.invoice_notes,
      i.client_id         AS invoice_client_id
    FROM inventory inv
    LEFT JOIN sold s              ON s.inventory_id = inv.id
    LEFT JOIN invoice_containers ic ON ic.container_id = inv.id
    LEFT JOIN invoices i          ON i.invoice_id = ic.invoice_id
    LEFT JOIN release_numbers rn  ON rn.release_number_id = inv.release_number_id
    LEFT JOIN sale_companies sco  ON sco.sale_company_id = inv.sale_company_id
    WHERE inv.id = $1
    LIMIT 1
  `;
  const containerRes = await db.query(containerSql, [params.container_id]);
  const containerRows = rowsOf<ContainerRow>(containerRes);
  if (containerRows.length === 0) {
    throw new Error(`Container ${params.container_id} not found`);
  }
  const ctr = containerRows[0];

  // 2) Resolve the customer. Prefer the explicit client_id param
  //    (no-invoice fallback) over the invoice's client_id.
  const clientId = params.client_id ?? ctr.invoice_client_id;
  if (clientId == null) {
    throw new Error(
      `Container ${params.container_id} has no invoice and no client_id was supplied`,
    );
  }
  const clientRes = await db.query(
    `SELECT id, client_name, business_name, contact_phone, contact_email,
            street, city, state, zip
     FROM clients
     WHERE id = $1`,
    [clientId],
  );
  const clientRows = rowsOf<ClientRow>(clientRes);
  if (clientRows.length === 0) {
    throw new Error(`Client ${clientId} not found`);
  }
  const cl = clientRows[0];

  // 3) Sold modifications, in display order.
  let modifications: DeliveryData['modifications'] = [];
  if (ctr.sold_id != null) {
    const modRes = await db.query(
      `SELECT description, price
       FROM sold_modifications
       WHERE sold_id = $1
       ORDER BY position, id`,
      [ctr.sold_id],
    );
    const modRows = rowsOf<{ description: string; price: string | null }>(modRes);
    modifications = modRows.map((r) => ({
      description: r.description,
      price: r.price,
    }));
  }

  // 4) Apply param overrides over DB defaults.
  const addrOverride = params.delivery_address ?? {};
  const resolvedStreet = addrOverride.street ?? ctr.destination ?? cl.street;
  const resolvedLocality = addrOverride.locality ?? buildLocality(cl);
  const resolvedName = addrOverride.name ?? null;

  const receiptSummary =
    params.receipt_summary ?? derivedReceiptSummary(ctr.size);

  return {
    delivery_id: reportId,
    generated_at: new Date().toISOString(),
    delivery_date: params.delivery_date ?? ctr.outbound_date ?? null,
    customer: {
      business_name: cl.business_name,
      client_name: cl.client_name,
      contact_phone: cl.contact_phone,
      contact_email: cl.contact_email,
    },
    delivery_address: {
      name: resolvedName,
      street: resolvedStreet,
      locality: resolvedLocality,
    },
    container: {
      unit_number: ctr.unit_number,
      size: ctr.size,
      damage: ctr.damage,
      release_number_value: ctr.release_number_value,
      sale_company_name: ctr.sale_company_name,
      receipt_summary: receiptSummary,
    },
    delivery_company: params.delivery_company ?? null,
    onsite_contact: params.onsite_contact ?? null,
    door_orientation: params.door_orientation ?? null,
    payment_details: params.payment_details ?? null,
    receipt_note: params.receipt_note ?? ctr.invoice_notes ?? null,
    modifications,
    notes: params.notes ?? null,
  };
}
