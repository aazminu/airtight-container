import db from '../../db/index.js';
import { rowsOf, type DeliveryData } from './types.js';

// Delivery sheet resolver.
//
// Invariant: a delivery sheet is generated for one of two source rows:
//   1. A sold/outbound container in `inventory` (sales path). The
//      resolver pulls customer + sold-row defaults via the
//      inventory → invoice_containers → invoices → clients chain.
//      Edge: if the container hasn't been invoiced yet (rare —
//      scheduled pickup before sale-close), the form supplies
//      `client_id` directly and we skip the invoice join.
//   2. An S&H box in `sh_inventory` (storage path). Client is
//      already linked on the row; no release/sale_company/invoice
//      data exists. Picker stores `sh_box_id` instead of
//      `container_id`.
//
// Modifications were intentionally removed from the delivery sheet —
// they belong on the invoice, not the receipt the driver hands over.

export interface DeliverySheetParams {
  container_id?: number;
  sh_box_id?: number;
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
  driver_contact?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  };
}

// Snapshot the driver-contact form fields into resolved_data. Returns
// null when nothing was provided (so the template / send-modal can
// short-circuit to "operator will fill at send time"). Empty strings
// normalize to null so the UI doesn't render them as data.
function normalizeDriverContact(
  v: DeliverySheetParams['driver_contact'],
): { name: string | null; phone: string | null; email: string | null } | null {
  if (!v) return null;
  const name = v.name?.trim() || null;
  const phone = v.phone?.trim() || null;
  const email = v.email?.trim() || null;
  if (!name && !phone && !email) return null;
  return { name, phone, email };
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

interface ShBoxRow {
  sh_box_id: number;
  unit_number: string;
  size: string;
  damage: string | null;
  checkout_date: string | null;
  client_id: number;
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
  const t = size.trim();
  return t.replace(/\s+/g, ' ');
}

function derivedReceiptSummary(size: string): string {
  return `1 ${sizeDescriptor(size)} Weather Tight Container`;
}

async function loadClient(clientId: number): Promise<ClientRow> {
  const res = await db.query(
    `SELECT id, client_name, business_name, contact_phone, contact_email,
            street, city, state, zip
     FROM clients
     WHERE id = $1`,
    [clientId],
  );
  const rows = rowsOf<ClientRow>(res);
  if (rows.length === 0) {
    throw new Error(`Client ${clientId} not found`);
  }
  return rows[0];
}

export async function resolveDeliverySheet(
  params: DeliverySheetParams,
  reportId: number,
): Promise<DeliveryData> {
  if (params.sh_box_id != null) {
    return resolveShBoxDelivery(params, params.sh_box_id, reportId);
  }
  if (params.container_id != null) {
    return resolveSalesDelivery(params, params.container_id, reportId);
  }
  throw new Error('Delivery sheet needs container_id or sh_box_id');
}

async function resolveSalesDelivery(
  params: DeliverySheetParams,
  containerId: number,
  reportId: number,
): Promise<DeliveryData> {
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
  const containerRes = await db.query(containerSql, [containerId]);
  const containerRows = rowsOf<ContainerRow>(containerRes);
  if (containerRows.length === 0) {
    throw new Error(`Container ${containerId} not found`);
  }
  const ctr = containerRows[0];

  const clientId = params.client_id ?? ctr.invoice_client_id;
  if (clientId == null) {
    throw new Error(
      `Container ${containerId} has no invoice and no client_id was supplied`,
    );
  }
  const cl = await loadClient(clientId);

  const addrOverride = params.delivery_address ?? {};
  const resolvedStreet = addrOverride.street ?? ctr.destination ?? cl.street;
  const resolvedLocality = addrOverride.locality ?? buildLocality(cl);
  const resolvedName = addrOverride.name ?? null;

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
      receipt_summary:
        params.receipt_summary ?? derivedReceiptSummary(ctr.size),
    },
    delivery_company: params.delivery_company ?? null,
    onsite_contact: params.onsite_contact ?? null,
    door_orientation: params.door_orientation ?? null,
    payment_details: params.payment_details ?? null,
    // Receipt note is operator-only — we do NOT default to
    // sold.invoice_notes. If the operator wants the invoice note on
    // the delivery sheet they can copy it in; otherwise the banner
    // stays off the page entirely.
    receipt_note: params.receipt_note ?? null,
    notes: params.notes ?? null,
    driver_contact: normalizeDriverContact(params.driver_contact),
  };
}

async function resolveShBoxDelivery(
  params: DeliverySheetParams,
  shBoxId: number,
  reportId: number,
): Promise<DeliveryData> {
  const res = await db.query(
    `SELECT id AS sh_box_id, unit_number, size, damage, checkout_date, client_id
     FROM sh_inventory
     WHERE id = $1`,
    [shBoxId],
  );
  const rows = rowsOf<ShBoxRow>(res);
  if (rows.length === 0) {
    throw new Error(`S&H box ${shBoxId} not found`);
  }
  const box = rows[0];
  const cl = await loadClient(params.client_id ?? box.client_id);

  const addrOverride = params.delivery_address ?? {};

  return {
    delivery_id: reportId,
    generated_at: new Date().toISOString(),
    delivery_date: params.delivery_date ?? box.checkout_date ?? null,
    customer: {
      business_name: cl.business_name,
      client_name: cl.client_name,
      contact_phone: cl.contact_phone,
      contact_email: cl.contact_email,
    },
    delivery_address: {
      name: addrOverride.name ?? null,
      street: addrOverride.street ?? cl.street,
      locality: addrOverride.locality ?? buildLocality(cl),
    },
    container: {
      unit_number: box.unit_number,
      size: box.size,
      damage: box.damage,
      // S&H boxes don't carry release / sale-company data — these are
      // null for the template to render as a dash.
      release_number_value: null,
      sale_company_name: null,
      receipt_summary:
        params.receipt_summary ?? derivedReceiptSummary(box.size),
    },
    delivery_company: params.delivery_company ?? null,
    onsite_contact: params.onsite_contact ?? null,
    door_orientation: params.door_orientation ?? null,
    payment_details: params.payment_details ?? null,
    receipt_note: params.receipt_note ?? null,
    notes: params.notes ?? null,
    driver_contact: normalizeDriverContact(params.driver_contact),
  };
}
