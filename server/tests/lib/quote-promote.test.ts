// Unit tests for promoteQuoteToInvoice's mapping logic. A fake
// PoolClient answers the quote/line/mod SELECTs and the invoice
// INSERTs/UPDATEs with canned rows, so we exercise the line→container
// pairing (positional + pinned + excess handling) without a real DB.

import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { promoteQuoteToInvoice } from '../../lib/quote-ops.js';

interface LineRow {
  id: number;
  sale_price: string | null;
  trucking_rate: string | null;
  destination: string | null;
}
interface ModRow {
  quote_line_item_id: number;
  description: string;
  price: string;
  position: number;
}

// Builds a fake client. Records every (sql, params) and answers the
// reads that promoteQuoteToInvoice + the invoice-ops it calls issue.
function fakeClient(opts: {
  quote?: {
    client_id: number;
    deleted_at: Date | string | null;
    quote_taxed?: boolean;
    quote_credit?: boolean;
    tax_rate?: string | null;
    cc_fee_rate?: string | null;
  };
  lines: LineRow[];
  mods?: ModRow[];
}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const quote = {
    client_id: 42,
    deleted_at: null,
    quote_taxed: false,
    quote_credit: false,
    tax_rate: null,
    cc_fee_rate: null,
    ...opts.quote,
  };
  const mods = opts.mods ?? [];

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM quotes WHERE id')) {
      return { rows: [quote] };
    }
    if (sql.includes('FROM quote_line_items')) {
      return { rows: opts.lines };
    }
    if (sql.includes('FROM quote_line_modifications')) {
      return { rows: mods };
    }
    // invoice-ops createInvoice: advisory lock, next-number SELECT, INSERT.
    // The next-number SELECT passes [min, max]; returning `min` keeps the
    // value in range regardless of the current month prefix.
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('AS next')) return { rows: [{ next: params[0] }] };
    if (sql.includes('INTO invoices')) return { rows: [{ invoice_id: 7 }] };
    // updateInvoiceFull reads
    if (sql.includes('FROM invoice_containers WHERE invoice_id'))
      return { rows: [] };
    if (sql.includes('FROM sold WHERE inventory_id'))
      return { rows: [{ id: 100 }] };
    if (sql.includes('FROM sold_modifications')) return { rows: [] };
    if (sql.startsWith('SELECT invoice_taxed'))
      return {
        rows: [
          {
            invoice_taxed: false,
            invoice_credit: false,
            tax_rate: null,
            cc_fee_rate: null,
          },
        ],
      };
    return { rows: [] };
  });

  return { client: { query } as unknown as PoolClient, calls };
}

// Pull the sold-row INSERT params for a given inventory_id. The INSERT
// is `INTO sold (...) VALUES ($1=inventory_id, $2=sale_price,
// $3=trucking_rate, $4=modification_price, $5=destination, ...)`.
function soldInsertFor(
  calls: Array<{ sql: string; params: unknown[] }>,
  inventoryId: number,
) {
  return calls
    .filter((c) => c.sql.includes('INSERT INTO sold ') && c.params[0] === inventoryId)
    .map((c) => ({
      sale_price: c.params[1],
      trucking_rate: c.params[2],
      destination: c.params[4],
    }))[0];
}

// The createInvoice INSERT carries [invoice_number, client_id,
// invoice_taxed, invoice_credit]; updateInvoiceFull's SET client_id
// UPDATE carries [client_id, invoice_taxed, invoice_credit, invoice_date,
// tax_rate, cc_fee_rate, ...].
function invoiceInsert(calls: Array<{ sql: string; params: unknown[] }>) {
  return calls.find((c) => c.sql.includes('INTO invoices'));
}
function invoiceUpdate(calls: Array<{ sql: string; params: unknown[] }>) {
  return calls.find(
    (c) => c.sql.includes('UPDATE invoices') && c.sql.includes('SET client_id'),
  );
}

describe('promoteQuoteToInvoice', () => {
  it('carries the quote tax + credit-card-fee settings onto the promoted invoice', async () => {
    const { client, calls } = fakeClient({
      quote: {
        client_id: 42,
        deleted_at: null,
        quote_taxed: true,
        quote_credit: true,
        tax_rate: '0.06625',
        cc_fee_rate: '0.03',
      },
      lines: [{ id: 1, sale_price: '1000', trucking_rate: null, destination: null }],
    });
    await promoteQuoteToInvoice(client, 5, { containers: [{ inventory_id: 11 }] });

    const ins = invoiceInsert(calls);
    expect(ins?.params[2]).toBe(true); // invoice_taxed
    expect(ins?.params[3]).toBe(true); // invoice_credit

    const upd = invoiceUpdate(calls);
    expect(upd?.params[1]).toBe(true); // invoice_taxed
    expect(upd?.params[2]).toBe(true); // invoice_credit
    expect(upd?.params[4]).toBe('0.06625'); // tax_rate
    expect(upd?.params[5]).toBe('0.03'); // cc_fee_rate
  });

  it('leaves the promoted invoice untaxed when the quote is untaxed', async () => {
    const { client, calls } = fakeClient({
      lines: [{ id: 1, sale_price: '1000', trucking_rate: null, destination: null }],
    });
    await promoteQuoteToInvoice(client, 5, { containers: [{ inventory_id: 11 }] });
    expect(invoiceInsert(calls)?.params[2]).toBe(false);
    expect(invoiceUpdate(calls)?.params[4]).toBeNull();
  });

  it('maps quote lines onto containers positionally', async () => {
    const { client, calls } = fakeClient({
      lines: [
        { id: 1, sale_price: '1000', trucking_rate: '200', destination: 'NJ' },
        { id: 2, sale_price: '1500', trucking_rate: '250', destination: 'NY' },
      ],
    });
    const result = await promoteQuoteToInvoice(client, 5, {
      containers: [{ inventory_id: 11 }, { inventory_id: 22 }],
    });
    expect(result.id).toBe(7);
    expect(typeof result.invoice_number).toBe('number');
    // sale_price + trucking_rate flow through from the quote line.
    // destination is server-derived from the invoice ship-to → client
    // billing cascade in updateInvoiceFull; the fake doesn't populate
    // either, so derive() returns null. (Quote-level destination is
    // not carried — the operator picks an address on the spawned
    // invoice if it differs from the client's billing.)
    expect(soldInsertFor(calls, 11)).toEqual({
      sale_price: '1000',
      trucking_rate: '200',
      destination: null,
    });
    expect(soldInsertFor(calls, 22)).toEqual({
      sale_price: '1500',
      trucking_rate: '250',
      destination: null,
    });
  });

  it('honors an explicit line_id pin and pairs the rest positionally', async () => {
    const { client, calls } = fakeClient({
      lines: [
        { id: 1, sale_price: '1000', trucking_rate: null, destination: null },
        { id: 2, sale_price: '2000', trucking_rate: null, destination: null },
      ],
    });
    // First container pins to line 2; second falls back to the only
    // remaining unpinned line (line 1).
    await promoteQuoteToInvoice(client, 5, {
      containers: [
        { inventory_id: 11, line_id: 2 },
        { inventory_id: 22 },
      ],
    });
    expect(soldInsertFor(calls, 11)?.sale_price).toBe('2000');
    expect(soldInsertFor(calls, 22)?.sale_price).toBe('1000');
  });

  it('leaves excess containers with blank pricing', async () => {
    const { client, calls } = fakeClient({
      lines: [
        { id: 1, sale_price: '1000', trucking_rate: null, destination: null },
      ],
    });
    await promoteQuoteToInvoice(client, 5, {
      containers: [{ inventory_id: 11 }, { inventory_id: 22 }],
    });
    expect(soldInsertFor(calls, 11)?.sale_price).toBe('1000');
    expect(soldInsertFor(calls, 22)?.sale_price).toBeNull();
  });

  it('rejects a missing quote with status 404', async () => {
    const { client } = fakeClient({ quote: undefined, lines: [] });
    // Override the quote read to return no rows.
    (client.query as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (sql: string) => {
        if (sql.includes('FROM quotes WHERE id')) return { rows: [] };
        return { rows: [] };
      },
    );
    await expect(
      promoteQuoteToInvoice(client, 999, {
        containers: [{ inventory_id: 11 }],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a deleted quote with status 409', async () => {
    const { client } = fakeClient({
      quote: { client_id: 42, deleted_at: new Date() },
      lines: [],
    });
    await expect(
      promoteQuoteToInvoice(client, 5, {
        containers: [{ inventory_id: 11 }],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects an empty container list with status 400', async () => {
    const { client } = fakeClient({ lines: [] });
    await expect(
      promoteQuoteToInvoice(client, 5, { containers: [] }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
