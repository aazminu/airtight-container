// Pure quote CRUD operations, extracted from routes/v2/quote.js so they
// can be unit-tested with a per-test BEGIN/ROLLBACK transaction (see
// tests/lib/quote-ops.test.ts). Mirrors lib/invoice-ops.ts, minus the
// inventory/sold machinery — a quote's line items are free text and
// touch no other table.
//
// Every function takes a `PoolClient` so the caller controls the
// transaction lifecycle; the HTTP route handlers wrap pool.connect() +
// BEGIN/COMMIT/ROLLBACK around these.

import type { PoolClient } from 'pg';
import { getNextQuoteNumber } from './quote-number.js';
import { createInvoice, updateInvoiceFull } from './invoice-ops.js';
import type { IncomingContainer, IncomingModification } from './invoice-ops.js';

export interface IncomingQuoteMod {
  description?: string;
  price?: string | number | null;
  position?: number | null;
}

export interface IncomingQuoteLine {
  description?: string;
  sale_price?: string | number | null;
  trucking_rate?: string | number | null;
  destination?: string | null;
  position?: number | null;
  modifications?: IncomingQuoteMod[];
}

export interface CreateQuoteBody {
  client_id: number;
  quote_taxed?: boolean;
  quote_credit?: boolean;
  tax_rate?: string | number | null;
  cc_fee_rate?: string | number | null;
  notes?: string | null;
  lines?: IncomingQuoteLine[];
}

export interface UpdateQuoteBody {
  client_id?: number;
  quote_taxed?: boolean;
  quote_credit?: boolean;
  tax_rate?: string | number | null;
  cc_fee_rate?: string | number | null;
  notes?: string | null;
  lines: IncomingQuoteLine[];
}

/**
 * Recompute snapshot totals from the current quote_line_items +
 * quote_line_modifications state and persist them onto the quote row.
 * Same math shape as invoice recomputeTotals: subtotal = sum of
 * sale_price + trucking_rate + per-line mods; tax/cc applied per the
 * quote's flags.
 *
 * Caller owns the transaction.
 */
export async function recomputeQuoteTotals(
  client: PoolClient,
  quoteId: number,
): Promise<void> {
  const { rows: lineRows } = await client.query<{
    id: number;
    sale_price: string | null;
    trucking_rate: string | null;
  }>(
    `SELECT id, sale_price, trucking_rate
       FROM quote_line_items
      WHERE quote_id = $1`,
    [quoteId],
  );
  const lineIds = lineRows.map((r) => r.id);
  const modsByLine = new Map<number, number>();
  if (lineIds.length > 0) {
    const { rows: modRows } = await client.query<{
      quote_line_item_id: number;
      price: string;
    }>(
      `SELECT quote_line_item_id, price
         FROM quote_line_modifications
        WHERE quote_line_item_id = ANY($1::int[])`,
      [lineIds],
    );
    for (const m of modRows) {
      modsByLine.set(
        m.quote_line_item_id,
        (modsByLine.get(m.quote_line_item_id) ?? 0) + Number(m.price),
      );
    }
  }
  let subtotal = 0;
  for (const r of lineRows) {
    subtotal += Number(r.sale_price ?? 0);
    subtotal += Number(r.trucking_rate ?? 0);
    subtotal += modsByLine.get(r.id) ?? 0;
  }
  const { rows: qRows } = await client.query<{
    quote_taxed: boolean;
    quote_credit: boolean;
    tax_rate: string | null;
    cc_fee_rate: string | null;
  }>(
    'SELECT quote_taxed, quote_credit, tax_rate, cc_fee_rate FROM quotes WHERE id = $1',
    [quoteId],
  );
  const q = qRows[0];
  const taxRate = Number(q.tax_rate ?? 0);
  const ccRate = Number(q.cc_fee_rate ?? 0);
  const taxAmount = q.quote_taxed ? subtotal * taxRate : 0;
  const ccAmount = q.quote_credit ? (subtotal + taxAmount) * ccRate : 0;
  const total = subtotal + taxAmount + ccAmount;
  await client.query(
    `UPDATE quotes
        SET subtotal = $1, tax_amount = $2, cc_fee_amount = $3, total = $4
      WHERE id = $5`,
    [
      subtotal.toFixed(2),
      taxAmount.toFixed(2),
      ccAmount.toFixed(2),
      total.toFixed(2),
      quoteId,
    ],
  );
}

// Replace every line (and its mods) for a quote with the incoming set.
// Lines have no external references, so delete-and-reinsert is the
// simplest correct reconciliation (the same approach invoice-ops uses
// for modifications). The cascade FK on quote_line_modifications drops
// the old mods when the parent line is deleted.
async function replaceLines(
  client: PoolClient,
  quoteId: number,
  lines: IncomingQuoteLine[],
): Promise<void> {
  await client.query('DELETE FROM quote_line_items WHERE quote_id = $1', [
    quoteId,
  ]);
  const list = Array.isArray(lines) ? lines : [];
  for (let i = 0; i < list.length; i++) {
    const line = list[i];
    if (!line.description || line.description.trim() === '') continue;
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO quote_line_items
         (quote_id, description, sale_price, trucking_rate, destination, position)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        quoteId,
        line.description,
        line.sale_price ?? null,
        line.trucking_rate ?? null,
        line.destination ?? null,
        line.position ?? i,
      ],
    );
    const lineId = rows[0].id;
    const mods = Array.isArray(line.modifications) ? line.modifications : [];
    for (let j = 0; j < mods.length; j++) {
      const m = mods[j];
      if (!m.description || m.price == null) continue;
      await client.query(
        `INSERT INTO quote_line_modifications
           (quote_line_item_id, description, price, position)
         VALUES ($1, $2, $3, $4)`,
        [lineId, m.description, m.price, m.position ?? j],
      );
    }
  }
}

/**
 * Create a quote with a server-assigned number (via advisory lock) and
 * its initial line items + mods. Returns the new id + quote_number.
 *
 * Caller owns the transaction.
 */
export async function createQuote(
  client: PoolClient,
  body: CreateQuoteBody,
): Promise<{ id: number; quote_number: string }> {
  const quoteNumber = await getNextQuoteNumber(client);
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO quotes
       (quote_number, client_id, quote_taxed, quote_credit, tax_rate, cc_fee_rate, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      quoteNumber,
      body.client_id,
      body.quote_taxed ?? false,
      body.quote_credit ?? false,
      body.tax_rate ?? null,
      body.cc_fee_rate ?? null,
      body.notes ?? null,
    ],
  );
  const quoteId = rows[0].id;
  await replaceLines(client, quoteId, body.lines ?? []);
  await recomputeQuoteTotals(client, quoteId);
  return { id: quoteId, quote_number: quoteNumber };
}

/**
 * Reconcile the full quote tree (quote fields + lines + per-line mods)
 * against the incoming body, then recompute snapshot totals. Editing a
 * quote clears any cached PDF (it no longer reflects the data) and, if
 * the quote was 'sent', leaves it 'sent' — the operator decides whether
 * to re-send.
 *
 * Caller owns the transaction.
 */
export async function updateQuoteFull(
  client: PoolClient,
  quoteId: number,
  body: UpdateQuoteBody,
): Promise<void> {
  await client.query(
    `UPDATE quotes
        SET client_id = COALESCE($1, client_id),
            quote_taxed = COALESCE($2, quote_taxed),
            quote_credit = COALESCE($3, quote_credit),
            tax_rate = $4,
            cc_fee_rate = $5,
            notes = $6,
            pdf_s3_key = NULL
      WHERE id = $7`,
    [
      body.client_id ?? null,
      body.quote_taxed ?? null,
      body.quote_credit ?? null,
      body.tax_rate ?? null,
      body.cc_fee_rate ?? null,
      body.notes ?? null,
      quoteId,
    ],
  );
  await replaceLines(client, quoteId, body.lines);
  await recomputeQuoteTotals(client, quoteId);
}

/**
 * Soft-delete a quote: stamp deleted_at and clear the cached PDF key,
 * keeping the row so its quote_number stays in the month's sequence
 * (mirrors the invoice tombstone). Lines + mods cascade-delete with the
 * row only if it's ever hard-deleted; here they stay for audit.
 *
 * Caller owns the transaction.
 */
export async function deleteQuote(
  client: PoolClient,
  quoteId: number,
): Promise<void> {
  await client.query(
    'UPDATE quotes SET deleted_at = NOW(), pdf_s3_key = NULL WHERE id = $1',
    [quoteId],
  );
}

export interface PromoteQuoteBody {
  // Chosen container inventory rows, in the order they should map onto
  // the quote's lines. Optionally a line_id can be pinned to a container
  // for an explicit (non-positional) mapping; any container without a
  // line_id falls back to positional pairing.
  containers: Array<{ inventory_id: number; line_id?: number | null }>;
}

interface QuotePromoteRow {
  client_id: number;
  deleted_at: Date | string | null;
}

interface QuoteLineForPromote {
  id: number;
  sale_price: string | null;
  trucking_rate: string | null;
  destination: string | null;
}

/**
 * Spawn a brand-new sales invoice from a quote, copying the quote's line
 * pricing onto the chosen containers. The quote is NOT consumed — it's
 * left intact and can be promoted again.
 *
 * Mapping (design assumption): a quote line is paired with a container
 * positionally — line[i] → container[i] — unless the caller pins a
 * container to a specific quote line via `line_id`. Pinned containers
 * take their pinned line; the remaining containers and lines pair up in
 * order. Excess containers (more boxes than lines) get no quote pricing
 * (blank sale_price/trucking/mods); excess lines (more lines than boxes)
 * are dropped — an invoice line must hang off a real container.
 *
 * Reuses invoice-ops.createInvoice (advisory-lock numbering + container
 * link) then updateInvoiceFull (sold-row reconcile, state flip, mods,
 * totals). Caller owns the transaction.
 */
export async function promoteQuoteToInvoice(
  client: PoolClient,
  quoteId: number,
  body: PromoteQuoteBody,
): Promise<{ id: number; invoice_number: number }> {
  const { rows: qRows } = await client.query<QuotePromoteRow>(
    'SELECT client_id, deleted_at FROM quotes WHERE id = $1',
    [quoteId],
  );
  const quote = qRows[0];
  if (!quote) {
    const err = new Error('Quote not found') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  if (quote.deleted_at !== null) {
    const err = new Error('Quote is deleted') as Error & { status?: number };
    err.status = 409;
    throw err;
  }

  const containers = Array.isArray(body.containers) ? body.containers : [];
  if (containers.length === 0) {
    const err = new Error(
      'At least one container is required to promote a quote',
    ) as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const { rows: lineRows } = await client.query<QuoteLineForPromote>(
    `SELECT id, sale_price, trucking_rate, destination
       FROM quote_line_items
      WHERE quote_id = $1
      ORDER BY position, id`,
    [quoteId],
  );

  const { rows: modRows } = await client.query<{
    quote_line_item_id: number;
    description: string;
    price: string;
    position: number;
  }>(
    `SELECT quote_line_item_id, description, price, position
       FROM quote_line_modifications
      WHERE quote_line_item_id = ANY($1::int[])
      ORDER BY quote_line_item_id, position, id`,
    [lineRows.map((l) => l.id)],
  );
  const modsByLine = new Map<number, IncomingModification[]>();
  for (const m of modRows) {
    if (!modsByLine.has(m.quote_line_item_id))
      modsByLine.set(m.quote_line_item_id, []);
    modsByLine.get(m.quote_line_item_id)!.push({
      description: m.description,
      price: m.price,
      position: m.position,
    });
  }

  // Resolve each container to a quote line. Explicit line_id pins win;
  // the rest pair positionally against the lines not already pinned.
  const lineById = new Map(lineRows.map((l) => [l.id, l]));
  const pinnedLineIds = new Set(
    containers
      .map((c) => c.line_id)
      .filter((id): id is number => id != null && lineById.has(id)),
  );
  const unpinnedLines = lineRows.filter((l) => !pinnedLineIds.has(l.id));
  let posCursor = 0;

  const invoiceContainers: IncomingContainer[] = containers.map((c) => {
    let line: QuoteLineForPromote | undefined;
    if (c.line_id != null && lineById.has(c.line_id)) {
      line = lineById.get(c.line_id);
    } else {
      line = unpinnedLines[posCursor];
      posCursor += 1;
    }
    return {
      inventory_id: c.inventory_id,
      sale_price: line?.sale_price ?? null,
      trucking_rate: line?.trucking_rate ?? null,
      modification_price: null,
      destination: line?.destination ?? null,
      modifications: line ? modsByLine.get(line.id) ?? [] : [],
    };
  });

  const created = await createInvoice(client, {
    client_id: quote.client_id,
    invoice_taxed: false,
    invoice_credit: false,
    containers: invoiceContainers.map((c) => ({ inventory_id: c.inventory_id })),
  });

  await updateInvoiceFull(client, created.id, {
    client_id: quote.client_id,
    containers: invoiceContainers,
  });

  return created;
}
