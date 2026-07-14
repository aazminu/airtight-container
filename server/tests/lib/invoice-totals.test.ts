// DB-free unit tests for the money/date logic in lib/invoice-ops.ts.
// A fake PoolClient answers the SELECTs by SQL substring and records the
// writes, so we assert the computed subtotal / normalized params without
// a real Postgres (unlike invoice-ops.test.ts, which is integration).

import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import {
  monthPrefix,
  recomputeTotals,
  updateInvoiceFull,
} from '../../lib/invoice-ops.js';

type Row = Record<string, unknown>;
interface Call {
  sql: string;
  params: unknown[];
}

function recomputeClient(opts: {
  ctRows: Row[];
  modRows: Row[];
  invoice: Row;
}) {
  const calls: Call[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('AS sold_id') && sql.includes('invoice_containers'))
      return { rows: opts.ctRows };
    if (sql.includes('FROM sold_modifications')) return { rows: opts.modRows };
    if (sql.startsWith('SELECT invoice_taxed')) return { rows: [opts.invoice] };
    return { rows: [] };
  });
  return { client: { query } as unknown as PoolClient, calls };
}

function subtotalOf(calls: Call[]): unknown {
  const upd = calls.find(
    (c) => c.sql.includes('UPDATE invoices') && c.sql.includes('SET subtotal'),
  );
  return upd?.params[0];
}

describe('recomputeTotals — modification subtotal', () => {
  const invoice = {
    invoice_taxed: false,
    invoice_credit: false,
    tax_rate: null,
    cc_fee_rate: null,
  };

  it('includes a negative-net (discount) modification instead of dropping it', async () => {
    const { client, calls } = recomputeClient({
      ctRows: [
        { sold_id: 1, sale_price: '1000', trucking_rate: null, modification_price: '0' },
      ],
      modRows: [{ sold_id: 1, price: '-300', quantity: 1 }],
      invoice,
    });
    await recomputeTotals(client, 1);
    expect(subtotalOf(calls)).toBe('700.00');
  });

  it('uses a zero-net modification sum, not the stale legacy scalar', async () => {
    const { client, calls } = recomputeClient({
      ctRows: [
        { sold_id: 1, sale_price: '1000', trucking_rate: null, modification_price: '999' },
      ],
      modRows: [{ sold_id: 1, price: '0', quantity: 1 }],
      invoice,
    });
    await recomputeTotals(client, 1);
    expect(subtotalOf(calls)).toBe('1000.00');
  });

  it('falls back to the legacy scalar only when there are no per-mod rows', async () => {
    const { client, calls } = recomputeClient({
      ctRows: [
        { sold_id: 1, sale_price: '1000', trucking_rate: null, modification_price: '250' },
      ],
      modRows: [],
      invoice,
    });
    await recomputeTotals(client, 1);
    expect(subtotalOf(calls)).toBe('1250.00');
  });

  it('multiplies modification price by quantity', async () => {
    const { client, calls } = recomputeClient({
      ctRows: [
        { sold_id: 1, sale_price: '0', trucking_rate: null, modification_price: null },
      ],
      modRows: [{ sold_id: 1, price: '150', quantity: 3 }],
      invoice,
    });
    await recomputeTotals(client, 1);
    expect(subtotalOf(calls)).toBe('450.00');
  });
});

describe('monthPrefix — Eastern month boundary', () => {
  it('keeps the prior month for a late-evening EDT instant that is next-day UTC', () => {
    // 2026-08-01 02:00 UTC = 2026-07-31 22:00 EDT
    expect(monthPrefix(new Date('2026-08-01T02:00:00Z'))).toBe(202607);
  });

  it('keeps the prior month across the EST (winter) boundary', () => {
    // 2026-01-01 04:30 UTC = 2025-12-31 23:30 EST
    expect(monthPrefix(new Date('2026-01-01T04:30:00Z'))).toBe(202512);
  });

  it('returns the Eastern month for a normal midday instant', () => {
    expect(monthPrefix(new Date('2026-07-15T16:00:00Z'))).toBe(202607);
  });
});

function updateClient() {
  const calls: Call[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM invoices i') && sql.includes('JOIN clients'))
      return {
        rows: [
          {
            ship_to_same_as_billing: false,
            ship_to_city: null,
            ship_to_state: null,
            client_city: null,
            client_state: null,
          },
        ],
      };
    if (sql.includes('container_id FROM invoice_containers')) return { rows: [] };
    if (sql.includes('FROM sold WHERE inventory_id')) return { rows: [{ id: 100 }] };
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
    if (sql.includes('AS sold_id') && sql.includes('invoice_containers'))
      return { rows: [] };
    if (sql.includes('FROM sold_modifications')) return { rows: [] };
    return { rows: [] };
  });
  return { client: { query } as unknown as PoolClient, calls };
}

describe('updateInvoiceFull — blank address normalization', () => {
  it('persists cleared ship-to / delivery fields as null, not empty string', async () => {
    const { client, calls } = updateClient();
    await updateInvoiceFull(client, 1, {
      client_id: 5,
      ship_to_name: '',
      ship_to_street: '   ',
      containers: [{ inventory_id: 11, delivery_name: '  ', delivery_street: '' }],
    });
    const invUpd = calls.find(
      (c) => c.sql.includes('UPDATE invoices') && c.sql.includes('SET client_id'),
    );
    // [0]=client_id [1]=taxed [2]=credit [3]=date [4]=tax [5]=cc [6]=same
    // [7]=name [8]=street [9]=city [10]=state [11]=zip [12]=id
    expect(invUpd?.params[7]).toBeNull();
    expect(invUpd?.params[8]).toBeNull();
    const soldIns = calls.find((c) => c.sql.includes('INSERT INTO sold '));
    // [0]=inv_id [1]=sale [2]=truck [3]=modprice [4]=dest [5]=notes
    // [6]=truckco [7]=door [8]=del_name [9]=del_street ...
    expect(soldIns?.params[8]).toBeNull();
    expect(soldIns?.params[9]).toBeNull();
  });
});
