// Pure invoice CRUD operations extracted from routes/v2/invoice.js so
// they can be unit-tested with a per-test BEGIN/ROLLBACK transaction
// (see tests/lib/invoice-ops.test.ts).
//
// Every function takes a `PoolClient` so the caller controls
// transaction lifecycle. The HTTP route handlers wrap a `pool.connect()`
// + BEGIN/COMMIT/ROLLBACK around these.

import type { PoolClient } from 'pg';
import { easternMonthPrefix } from './quote-number.js';

// Stable advisory-lock key for sales-invoice number sequencing. Hex
// derived from "AIRSEQ#" ASCII so the value is namespaced. Postgres
// pg_advisory_xact_lock takes bigint; we pass as a decimal string.
const SALES_INVOICE_SEQ_LOCK_KEY = 0x4149_5253_4551_4e23n.toString();

// Collapse blank/whitespace-only text to null so the `??`/COALESCE
// fallbacks downstream (notably the delivery-sheet address cascade in
// report-resolvers/delivery.ts) treat a cleared field as unset rather
// than as a present empty string that short-circuits the cascade.
function blankToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export interface IncomingModification {
  description?: string;
  price?: string | number | null;
  quantity?: number | null;
  position?: number | null;
}

export interface IncomingContainer {
  inventory_id: number;
  sale_price?: string | number | null;
  trucking_rate?: string | number | null;
  modification_price?: string | number | null;
  invoice_notes?: string | null;
  // Per-container delivery (migration 0017). The UI cascades defaults from
  // the invoice ship-to; these are the resolved per-box values.
  outbound_trucking_company_id?: number | null;
  door_orientation?: string | null;
  delivery_name?: string | null;
  delivery_street?: string | null;
  delivery_city?: string | null;
  delivery_state?: string | null;
  delivery_zip?: string | null;
  modifications?: IncomingModification[];
}

export interface UpdateInvoiceBody {
  client_id?: number;
  invoice_taxed?: boolean;
  invoice_credit?: boolean;
  invoice_date?: string;
  tax_rate?: string | number | null;
  cc_fee_rate?: string | number | null;
  // Invoice-level ship-to (migration 0017). Defaults to the client's
  // billing address when ship_to_same_as_billing is true.
  ship_to_same_as_billing?: boolean;
  ship_to_name?: string | null;
  ship_to_street?: string | null;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  ship_to_zip?: string | null;
  containers: IncomingContainer[];
}

export interface CreateInvoiceBody {
  client_id: number;
  invoice_taxed?: boolean;
  invoice_credit?: boolean;
  containers: Array<{ id?: number; inventory_id?: number }>;
}

/**
 * Compute the next `invoice_number` for the given month (YYYYMM
 * 7-digit prefix). Acquires a transaction-scoped advisory lock so two
 * concurrent callers can't pick the same number. Throws if the
 * three-digit suffix has been exhausted for the month.
 *
 * Caller must already have a transaction open on `client`.
 */
export async function getNextInvoiceNumber(
  client: PoolClient,
  monthPrefix: number,
): Promise<number> {
  await client.query('SELECT pg_advisory_xact_lock($1)', [
    SALES_INVOICE_SEQ_LOCK_KEY,
  ]);
  const min = monthPrefix * 1000 + 1;
  const max = monthPrefix * 1000 + 999;
  const { rows } = await client.query<{ next: number }>(
    `SELECT COALESCE(MAX(invoice_number), $1::int - 1) + 1 AS next
     FROM invoices
     WHERE invoice_number BETWEEN $1 AND $2`,
    [min, max],
  );
  const next = rows[0].next;
  if (next > max) {
    throw new Error(
      `Out of invoice numbers for ${monthPrefix} (sequence exhausted at 999)`,
    );
  }
  return next;
}

export function monthPrefix(date: Date = new Date()): number {
  // Eastern-time YYYYMM so an invoice created late-evening ET on the last
  // day of a month keeps that month's sequence instead of rolling into the
  // next with the container's UTC clock. Mirrors quote numbering.
  return parseInt(easternMonthPrefix(date), 10);
}

/**
 * Recompute snapshot totals from the current `invoice_containers` +
 * `sold` + `sold_modifications` state and persist them to the
 * `invoices` row. Per-modification line items take precedence over
 * the legacy `sold.modification_price` scalar on a per-sold basis.
 */
export async function recomputeTotals(
  client: PoolClient,
  invoiceId: number,
): Promise<void> {
  const { rows: ctRows } = await client.query<{
    sold_id: number | null;
    sale_price: string | null;
    trucking_rate: string | null;
    modification_price: string | null;
  }>(
    `SELECT sc.id AS sold_id, sc.sale_price, sc.trucking_rate, sc.modification_price
     FROM invoice_containers ci
     JOIN inventory inv ON ci.container_id = inv.id
     LEFT JOIN sold sc ON inv.id = sc.inventory_id
     WHERE ci.invoice_id = $1`,
    [invoiceId],
  );
  const soldIds = ctRows.map((r) => r.sold_id).filter((id): id is number => id != null);
  const modsBySold = new Map<number, number>();
  if (soldIds.length > 0) {
    const { rows: modRows } = await client.query<{
      sold_id: number;
      price: string;
      quantity: number;
    }>(
      `SELECT sold_id, price, quantity FROM sold_modifications WHERE sold_id = ANY($1::int[])`,
      [soldIds],
    );
    for (const m of modRows) {
      modsBySold.set(
        m.sold_id,
        (modsBySold.get(m.sold_id) ?? 0) + Number(m.price) * (m.quantity || 1),
      );
    }
  }
  let subtotal = 0;
  for (const r of ctRows) {
    subtotal += Number(r.sale_price ?? 0);
    subtotal += Number(r.trucking_rate ?? 0);
    const perMod = r.sold_id != null ? modsBySold.get(r.sold_id) : undefined;
    if (perMod !== undefined) {
      // Presence, not sign: a container that has per-mod line items uses
      // their sum even when it nets to zero or negative (discount/credit
      // lines). Only fall back to the legacy scalar when there are no
      // per-mod rows at all — otherwise a discount silently vanishes.
      subtotal += perMod;
    } else {
      subtotal += Number(r.modification_price ?? 0);
    }
  }
  const { rows: invRows } = await client.query<{
    invoice_taxed: boolean;
    invoice_credit: boolean;
    tax_rate: string | null;
    cc_fee_rate: string | null;
  }>(
    'SELECT invoice_taxed, invoice_credit, tax_rate, cc_fee_rate FROM invoices WHERE invoice_id = $1',
    [invoiceId],
  );
  const inv = invRows[0];
  const taxRate = Number(inv.tax_rate ?? 0);
  const ccRate = Number(inv.cc_fee_rate ?? 0);
  const taxAmount = inv.invoice_taxed ? subtotal * taxRate : 0;
  const ccAmount = inv.invoice_credit ? (subtotal + taxAmount) * ccRate : 0;
  const total = subtotal + taxAmount + ccAmount;
  await client.query(
    `UPDATE invoices
     SET subtotal = $1, tax_amount = $2, cc_fee_amount = $3, total = $4
     WHERE invoice_id = $5`,
    [
      subtotal.toFixed(2),
      taxAmount.toFixed(2),
      ccAmount.toFixed(2),
      total.toFixed(2),
      invoiceId,
    ],
  );
}

/**
 * Reconcile the full invoice tree (invoice fields + containers + per
 * container's sold row + per container's modifications) against the
 * incoming body. Container add/remove flips `inventory.state` between
 * 'available' and 'sold'. Modifications are delete-and-reinsert per
 * sold for simplicity (they're display-only and have no external
 * references). Recomputes snapshot totals at the end.
 *
 * Caller owns the transaction.
 */
export async function updateInvoiceFull(
  client: PoolClient,
  invoiceId: number,
  body: UpdateInvoiceBody,
): Promise<void> {
  await client.query(
    `UPDATE invoices
     SET client_id = COALESCE($1, client_id),
         invoice_taxed = COALESCE($2, invoice_taxed),
         invoice_credit = COALESCE($3, invoice_credit),
         invoice_date = COALESCE($4, invoice_date),
         tax_rate = COALESCE($5, tax_rate),
         cc_fee_rate = COALESCE($6, cc_fee_rate),
         ship_to_same_as_billing = COALESCE($7, ship_to_same_as_billing),
         ship_to_name = $8,
         ship_to_street = $9,
         ship_to_city = $10,
         ship_to_state = $11,
         ship_to_zip = $12
     WHERE invoice_id = $13`,
    [
      body.client_id ?? null,
      body.invoice_taxed ?? null,
      body.invoice_credit ?? null,
      body.invoice_date ?? null,
      body.tax_rate ?? null,
      body.cc_fee_rate ?? null,
      body.ship_to_same_as_billing ?? null,
      blankToNull(body.ship_to_name),
      blankToNull(body.ship_to_street),
      blankToNull(body.ship_to_city),
      blankToNull(body.ship_to_state),
      blankToNull(body.ship_to_zip),
      invoiceId,
    ],
  );

  // Resolve the effective shipping city/state once — used to derive each
  // container's destination from the address cascade
  // (per-box delivery → invoice ship-to → client billing). Operator no
  // longer types destination; it's inferred from whichever address the
  // box is actually going to.
  const { rows: shipRows } = await client.query<{
    ship_to_same_as_billing: boolean;
    ship_to_city: string | null;
    ship_to_state: string | null;
    client_city: string | null;
    client_state: string | null;
  }>(
    `SELECT i.ship_to_same_as_billing,
            i.ship_to_city, i.ship_to_state,
            c.city  AS client_city,
            c.state AS client_state
     FROM invoices i
     JOIN clients c ON c.id = i.client_id
     WHERE i.invoice_id = $1`,
    [invoiceId],
  );
  const shipRow = shipRows[0];
  const effectiveShipCity = shipRow?.ship_to_same_as_billing
    ? shipRow.client_city
    : (shipRow?.ship_to_city ?? null);
  const effectiveShipState = shipRow?.ship_to_same_as_billing
    ? shipRow.client_state
    : (shipRow?.ship_to_state ?? null);

  const deriveDestination = (ct: IncomingContainer): string | null => {
    const city = ct.delivery_city || effectiveShipCity;
    const state = ct.delivery_state || effectiveShipState;
    if (!city && !state) return null;
    return [city, state].filter(Boolean).join(', ');
  };

  const { rows: existingCt } = await client.query<{ container_id: number }>(
    'SELECT container_id FROM invoice_containers WHERE invoice_id = $1',
    [invoiceId],
  );
  const existingIds = new Set(existingCt.map((r) => r.container_id));
  const incoming = Array.isArray(body.containers) ? body.containers : [];
  const incomingIds = new Set(incoming.map((c) => c.inventory_id));

  // Remove containers no longer on this invoice
  for (const row of existingCt) {
    if (!incomingIds.has(row.container_id)) {
      await client.query(
        'DELETE FROM invoice_containers WHERE invoice_id = $1 AND container_id = $2',
        [invoiceId, row.container_id],
      );
      await client.query('DELETE FROM sold WHERE inventory_id = $1', [
        row.container_id,
      ]);
      await client.query(
        "UPDATE inventory SET state = 'available' WHERE id = $1",
        [row.container_id],
      );
    }
  }

  // Add new containers + upsert sold rows + reconcile mods. Always
  // sets state='sold' for every container on the invoice (idempotent;
  // also handles the case where createInvoice inserted the row but
  // didn't flip state — happens in the new create flow).
  for (const ct of incoming) {
    if (!existingIds.has(ct.inventory_id)) {
      await client.query(
        'INSERT INTO invoice_containers (invoice_id, container_id) VALUES ($1, $2)',
        [invoiceId, ct.inventory_id],
      );
    }
    await client.query("UPDATE inventory SET state = 'sold' WHERE id = $1", [
      ct.inventory_id,
    ]);
    // outbound_date is intentionally NOT managed here. It belongs to the
    // container lifecycle (stamped when the driver receipt is printed —
    // see report.js complete-pickup), not invoicing. Writing it from the
    // invoice path would clobber a real pickup date on every invoice edit.
    await client.query(
      `INSERT INTO sold (inventory_id, sale_price, trucking_rate,
                         modification_price, destination, invoice_notes,
                         outbound_trucking_company_id, door_orientation,
                         delivery_name, delivery_street, delivery_city,
                         delivery_state, delivery_zip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (inventory_id) DO UPDATE SET
         sale_price = EXCLUDED.sale_price,
         trucking_rate = EXCLUDED.trucking_rate,
         modification_price = EXCLUDED.modification_price,
         destination = EXCLUDED.destination,
         invoice_notes = EXCLUDED.invoice_notes,
         outbound_trucking_company_id = EXCLUDED.outbound_trucking_company_id,
         door_orientation = EXCLUDED.door_orientation,
         delivery_name = EXCLUDED.delivery_name,
         delivery_street = EXCLUDED.delivery_street,
         delivery_city = EXCLUDED.delivery_city,
         delivery_state = EXCLUDED.delivery_state,
         delivery_zip = EXCLUDED.delivery_zip`,
      [
        ct.inventory_id,
        ct.sale_price ?? null,
        ct.trucking_rate ?? null,
        ct.modification_price ?? null,
        deriveDestination(ct),
        ct.invoice_notes ?? null,
        ct.outbound_trucking_company_id ?? null,
        ct.door_orientation ?? null,
        blankToNull(ct.delivery_name),
        blankToNull(ct.delivery_street),
        blankToNull(ct.delivery_city),
        blankToNull(ct.delivery_state),
        blankToNull(ct.delivery_zip),
      ],
    );

    const { rows: soldRows } = await client.query<{ id: number }>(
      'SELECT id FROM sold WHERE inventory_id = $1',
      [ct.inventory_id],
    );
    const soldId = soldRows[0]?.id;
    if (soldId != null) {
      await client.query(
        'DELETE FROM sold_modifications WHERE sold_id = $1',
        [soldId],
      );
      const mods = Array.isArray(ct.modifications) ? ct.modifications : [];
      for (let i = 0; i < mods.length; i++) {
        const m = mods[i];
        if (!m.description || m.price == null) continue;
        await client.query(
          'INSERT INTO sold_modifications (sold_id, description, price, quantity, position) VALUES ($1, $2, $3, $4, $5)',
          [soldId, m.description, m.price, m.quantity ?? 1, m.position ?? i],
        );
      }
    }
  }

  await recomputeTotals(client, invoiceId);
}

/**
 * Tombstone an invoice: keep the row (so the YYYYMM sequence stays
 * contiguous and the gap shows up in the list) but mark it deleted_at
 * and release every container back to 'available' inventory. The sold
 * rows + invoice_containers + cascaded sold_modifications all go away
 * because the boxes weren't actually sold. The cached PDF key is
 * cleared since the PDF no longer reflects truth (the S3 object
 * orphans — cheap, can be swept later).
 *
 * Caller owns the transaction.
 */
export async function deleteInvoiceCascade(
  client: PoolClient,
  invoiceId: number,
): Promise<void> {
  const { rows } = await client.query<{ container_id: number }>(
    'SELECT container_id FROM invoice_containers WHERE invoice_id = $1',
    [invoiceId],
  );
  for (const r of rows) {
    await client.query('DELETE FROM sold WHERE inventory_id = $1', [
      r.container_id,
    ]);
    await client.query(
      "UPDATE inventory SET state = 'available' WHERE id = $1",
      [r.container_id],
    );
  }
  await client.query(
    'DELETE FROM invoice_containers WHERE invoice_id = $1',
    [invoiceId],
  );
  await client.query(
    "UPDATE invoices SET deleted_at = NOW(), pdf_s3_key = NULL WHERE invoice_id = $1",
    [invoiceId],
  );
}

/**
 * Create an invoice with a server-assigned number (via advisory lock)
 * and link the given containers. Returns the new invoice_id +
 * invoice_number. Does NOT mark containers sold or create sold rows —
 * the legacy CreateInvoice flow handles that via /api/v1/inventory/sold,
 * and the new flow round-trips via updateInvoiceFull afterwards.
 *
 * Caller owns the transaction.
 */
export async function createInvoice(
  client: PoolClient,
  body: CreateInvoiceBody,
): Promise<{ id: number; invoice_number: number }> {
  const prefix = monthPrefix();
  const invoiceNumber = await getNextInvoiceNumber(client, prefix);
  const { rows } = await client.query<{ invoice_id: number }>(
    `INSERT INTO invoices (invoice_number, client_id, invoice_taxed, invoice_credit)
     VALUES ($1, $2, $3, $4)
     RETURNING invoice_id`,
    [
      invoiceNumber,
      body.client_id,
      body.invoice_taxed ?? false,
      body.invoice_credit ?? false,
    ],
  );
  const invoiceId = rows[0].invoice_id;
  for (const c of body.containers ?? []) {
    const cid = c.id ?? c.inventory_id;
    if (!cid) continue;
    await client.query(
      'INSERT INTO invoice_containers (invoice_id, container_id) VALUES ($1, $2)',
      [invoiceId, cid],
    );
  }
  return { id: invoiceId, invoice_number: invoiceNumber };
}
