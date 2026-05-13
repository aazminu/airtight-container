// Integration tests for lib/invoice-ops.ts. Each test runs inside a
// BEGIN/ROLLBACK transaction against the local DB so no state leaks
// between tests or runs. Requires DATABASE_URL in server/.env (the
// same one ./dev.sh uses).

import 'dotenv/config';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import pool from '../../db/pool.js';
import {
  createInvoice,
  deleteInvoiceCascade,
  getNextInvoiceNumber,
  monthPrefix,
  recomputeTotals,
  updateInvoiceFull,
} from '../../lib/invoice-ops.js';

let client: PoolClient;

// Fixture ids populated in beforeEach so each test can reference them.
interface Fixtures {
  clientId: number;
  releaseId: number;
  saleCompanyId: number;
  inventoryA: number;
  inventoryB: number;
}

let fx: Fixtures;

const insertFixtures = async (c: PoolClient): Promise<Fixtures> => {
  const { rows: [client_] } = await c.query<{ id: number }>(
    `INSERT INTO clients (client_name) VALUES ('test-fixture') RETURNING id`,
  );
  const { rows: [sale] } = await c.query<{ sale_company_id: number }>(
    `INSERT INTO sale_companies (sale_company_name)
     VALUES ('test-sale-co-' || gen_random_uuid()::text)
     RETURNING sale_company_id`,
  );
  const { rows: [release] } = await c.query<{ release_number_id: number }>(
    `INSERT INTO release_numbers (release_number_value, sale_company_id)
     VALUES ('TEST-' || gen_random_uuid()::text, $1)
     RETURNING release_number_id`,
    [sale.sale_company_id],
  );
  const { rows: [a] } = await c.query<{ id: number }>(
    `INSERT INTO inventory (unit_number, size, damage, release_number_id, sale_company_id, state, is_pending_audit)
     VALUES ('TESTA', '40HC', 'WWT', $1, $2, 'available', false)
     RETURNING id`,
    [release.release_number_id, sale.sale_company_id],
  );
  const { rows: [b] } = await c.query<{ id: number }>(
    `INSERT INTO inventory (unit_number, size, damage, release_number_id, sale_company_id, state, is_pending_audit)
     VALUES ('TESTB', '20HC', 'WWT', $1, $2, 'available', false)
     RETURNING id`,
    [release.release_number_id, sale.sale_company_id],
  );
  return {
    clientId: client_.id,
    releaseId: release.release_number_id,
    saleCompanyId: sale.sale_company_id,
    inventoryA: a.id,
    inventoryB: b.id,
  };
};

beforeAll(async () => {
  client = await pool.connect();
});

afterAll(async () => {
  client.release();
  await pool.end();
});

beforeEach(async () => {
  await client.query('BEGIN');
  fx = await insertFixtures(client);
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

const inventoryState = async (id: number): Promise<string> => {
  const { rows } = await client.query<{ state: string }>(
    'SELECT state FROM inventory WHERE id = $1',
    [id],
  );
  return rows[0].state;
};

const soldRowExists = async (inventoryId: number): Promise<boolean> => {
  const { rows } = await client.query<{ id: number }>(
    'SELECT id FROM sold WHERE inventory_id = $1',
    [inventoryId],
  );
  return rows.length > 0;
};

const invoiceContainerCount = async (invoiceId: number): Promise<number> => {
  const { rows } = await client.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM invoice_containers WHERE invoice_id = $1',
    [invoiceId],
  );
  return rows[0].n;
};

const modsForSold = async (
  soldId: number,
): Promise<Array<{ description: string; price: string; position: number }>> => {
  const { rows } = await client.query<{
    description: string;
    price: string;
    position: number;
  }>(
    'SELECT description, price, position FROM sold_modifications WHERE sold_id = $1 ORDER BY position',
    [soldId],
  );
  return rows;
};

const soldIdFor = async (inventoryId: number): Promise<number | null> => {
  const { rows } = await client.query<{ id: number }>(
    'SELECT id FROM sold WHERE inventory_id = $1',
    [inventoryId],
  );
  return rows[0]?.id ?? null;
};

describe('monthPrefix', () => {
  it('formats YYYYMM with leading zero on month', () => {
    expect(monthPrefix(new Date('2026-03-15T12:00:00Z'))).toBe(202603);
    expect(monthPrefix(new Date('2026-11-01T12:00:00Z'))).toBe(202611);
  });
});

describe('getNextInvoiceNumber', () => {
  it('returns prefix*1000 + 1 for a month with no invoices', async () => {
    // Use a far-future month so we never conflict with real data.
    const prefix = 209901;
    const next = await getNextInvoiceNumber(client, prefix);
    expect(next).toBe(prefix * 1000 + 1);
  });

  it('returns max+1 when invoices exist for the month', async () => {
    const prefix = 209902;
    await client.query(
      `INSERT INTO invoices (invoice_number, client_id) VALUES ($1, $2)`,
      [prefix * 1000 + 5, fx.clientId],
    );
    const next = await getNextInvoiceNumber(client, prefix);
    expect(next).toBe(prefix * 1000 + 6);
  });

  it('throws when the sequence is exhausted at 999', async () => {
    const prefix = 209903;
    await client.query(
      `INSERT INTO invoices (invoice_number, client_id) VALUES ($1, $2)`,
      [prefix * 1000 + 999, fx.clientId],
    );
    await expect(getNextInvoiceNumber(client, prefix)).rejects.toThrow(
      /exhausted/,
    );
  });
});

describe('createInvoice', () => {
  it('inserts the invoice + invoice_containers and returns id + number', async () => {
    const result = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }],
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.invoice_number).toBeGreaterThan(0);
    expect(await invoiceContainerCount(result.id)).toBe(1);
  });

  it('accepts both `id` and `inventory_id` shapes for containers', async () => {
    const result = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }, { inventory_id: fx.inventoryB }],
    });
    expect(await invoiceContainerCount(result.id)).toBe(2);
  });

  it('skips containers with no id', async () => {
    const result = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }, {}],
    });
    expect(await invoiceContainerCount(result.id)).toBe(1);
  });
});

describe('updateInvoiceFull', () => {
  it('adds a container → inventory.state = sold + sold row created', async () => {
    const { id } = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }],
    });
    // initial: A is 'available' still because createInvoice doesn't flip state
    expect(await inventoryState(fx.inventoryA)).toBe('available');

    await updateInvoiceFull(client, id, {
      containers: [
        {
          inventory_id: fx.inventoryA,
          sale_price: '1500',
        },
      ],
    });

    expect(await inventoryState(fx.inventoryA)).toBe('sold');
    expect(await soldRowExists(fx.inventoryA)).toBe(true);
  });

  it('removes a container → inventory.state back to available + sold row deleted + mods cascaded', async () => {
    const { id } = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }, { id: fx.inventoryB }],
    });
    await updateInvoiceFull(client, id, {
      containers: [
        {
          inventory_id: fx.inventoryA,
          sale_price: '1000',
          modifications: [{ description: 'paint', price: '200' }],
        },
        { inventory_id: fx.inventoryB, sale_price: '2000' },
      ],
    });
    expect(await inventoryState(fx.inventoryA)).toBe('sold');
    expect(await inventoryState(fx.inventoryB)).toBe('sold');
    const soldA = (await soldIdFor(fx.inventoryA))!;
    expect((await modsForSold(soldA)).length).toBe(1);

    // Now drop B from the invoice.
    await updateInvoiceFull(client, id, {
      containers: [
        {
          inventory_id: fx.inventoryA,
          sale_price: '1000',
          modifications: [{ description: 'paint', price: '200' }],
        },
      ],
    });
    expect(await inventoryState(fx.inventoryB)).toBe('available');
    expect(await soldRowExists(fx.inventoryB)).toBe(false);
    expect(await invoiceContainerCount(id)).toBe(1);
    // A's mods still there
    expect((await modsForSold(soldA)).length).toBe(1);
  });

  it('drops a container that has mods → mods cascade-deleted by FK', async () => {
    const { id } = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }],
    });
    await updateInvoiceFull(client, id, {
      containers: [
        {
          inventory_id: fx.inventoryA,
          sale_price: '1500',
          modifications: [
            { description: 'paint', price: '200' },
            { description: 'door', price: '500' },
          ],
        },
      ],
    });
    const soldA = (await soldIdFor(fx.inventoryA))!;
    expect((await modsForSold(soldA)).length).toBe(2);

    await updateInvoiceFull(client, id, { containers: [] });
    expect(await inventoryState(fx.inventoryA)).toBe('available');
    expect(await soldRowExists(fx.inventoryA)).toBe(false);
    // mods follow sold row via ON DELETE CASCADE
    const { rows } = await client.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM sold_modifications WHERE sold_id = $1',
      [soldA],
    );
    expect(rows[0].n).toBe(0);
  });

  it('reorders mods by replacing with new positions', async () => {
    const { id } = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }],
    });
    await updateInvoiceFull(client, id, {
      containers: [
        {
          inventory_id: fx.inventoryA,
          sale_price: '1500',
          modifications: [
            { description: 'first', price: '100' },
            { description: 'second', price: '200' },
          ],
        },
      ],
    });
    const soldA = (await soldIdFor(fx.inventoryA))!;
    const before = await modsForSold(soldA);
    expect(before.map((m) => m.description)).toEqual(['first', 'second']);

    // Swap order
    await updateInvoiceFull(client, id, {
      containers: [
        {
          inventory_id: fx.inventoryA,
          sale_price: '1500',
          modifications: [
            { description: 'second', price: '200' },
            { description: 'first', price: '100' },
          ],
        },
      ],
    });
    const after = await modsForSold(soldA);
    expect(after.map((m) => m.description)).toEqual(['second', 'first']);
  });

  it('skips mod rows with empty description or null price', async () => {
    const { id } = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }],
    });
    await updateInvoiceFull(client, id, {
      containers: [
        {
          inventory_id: fx.inventoryA,
          sale_price: '1500',
          modifications: [
            { description: 'real', price: '100' },
            { description: '', price: '50' },
            { description: 'no-price', price: null },
          ],
        },
      ],
    });
    const soldA = (await soldIdFor(fx.inventoryA))!;
    const mods = await modsForSold(soldA);
    expect(mods.length).toBe(1);
    expect(mods[0].description).toBe('real');
  });
});

describe('recomputeTotals', () => {
  it('sums sale + trucking + per-mod into subtotal', async () => {
    const { id } = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }],
    });
    await updateInvoiceFull(client, id, {
      invoice_taxed: false,
      invoice_credit: false,
      containers: [
        {
          inventory_id: fx.inventoryA,
          sale_price: '1000',
          trucking_rate: '200',
          modifications: [{ description: 'paint', price: '50' }],
        },
      ],
    });
    const { rows } = await client.query<{ subtotal: string; total: string }>(
      'SELECT subtotal, total FROM invoices WHERE invoice_id = $1',
      [id],
    );
    expect(Number(rows[0].subtotal)).toBeCloseTo(1250, 2);
    expect(Number(rows[0].total)).toBeCloseTo(1250, 2);
  });

  it('per-mod overrides legacy modification_price when both present', async () => {
    const { id } = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }],
    });
    await updateInvoiceFull(client, id, {
      containers: [
        {
          inventory_id: fx.inventoryA,
          sale_price: '1000',
          modification_price: '500', // legacy scalar
          modifications: [{ description: 'paint', price: '50' }], // per-mod
        },
      ],
    });
    const { rows } = await client.query<{ subtotal: string }>(
      'SELECT subtotal FROM invoices WHERE invoice_id = $1',
      [id],
    );
    // per-mod wins: 1000 + 50, not 1000 + 500
    expect(Number(rows[0].subtotal)).toBeCloseTo(1050, 2);
  });

  it('falls back to legacy modification_price when no per-mods', async () => {
    const { id } = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }],
    });
    await updateInvoiceFull(client, id, {
      containers: [
        {
          inventory_id: fx.inventoryA,
          sale_price: '1000',
          modification_price: '500',
        },
      ],
    });
    const { rows } = await client.query<{ subtotal: string }>(
      'SELECT subtotal FROM invoices WHERE invoice_id = $1',
      [id],
    );
    expect(Number(rows[0].subtotal)).toBeCloseTo(1500, 2);
  });

  it('applies sales tax when invoice_taxed', async () => {
    const { id } = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }],
    });
    await updateInvoiceFull(client, id, {
      invoice_taxed: true,
      tax_rate: '0.06625',
      containers: [{ inventory_id: fx.inventoryA, sale_price: '1000' }],
    });
    const { rows } = await client.query<{ tax_amount: string; total: string }>(
      'SELECT tax_amount, total FROM invoices WHERE invoice_id = $1',
      [id],
    );
    expect(Number(rows[0].tax_amount)).toBeCloseTo(66.25, 2);
    expect(Number(rows[0].total)).toBeCloseTo(1066.25, 2);
  });

  it('applies CC fee on top of subtotal+tax when invoice_credit', async () => {
    const { id } = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }],
    });
    await updateInvoiceFull(client, id, {
      invoice_taxed: true,
      invoice_credit: true,
      tax_rate: '0.06625',
      cc_fee_rate: '0.035',
      containers: [{ inventory_id: fx.inventoryA, sale_price: '1000' }],
    });
    const { rows } = await client.query<{
      subtotal: string;
      tax_amount: string;
      cc_fee_amount: string;
      total: string;
    }>(
      'SELECT subtotal, tax_amount, cc_fee_amount, total FROM invoices WHERE invoice_id = $1',
      [id],
    );
    expect(Number(rows[0].subtotal)).toBeCloseTo(1000, 2);
    expect(Number(rows[0].tax_amount)).toBeCloseTo(66.25, 2);
    // CC fee = (1000 + 66.25) * 0.035 = 37.32 (round 2dp)
    expect(Number(rows[0].cc_fee_amount)).toBeCloseTo(37.32, 2);
    expect(Number(rows[0].total)).toBeCloseTo(1103.57, 2);
  });
});

describe('deleteInvoiceCascade', () => {
  it('removes invoice + sold rows + frees inventory back to available', async () => {
    const { id } = await createInvoice(client, {
      client_id: fx.clientId,
      containers: [{ id: fx.inventoryA }, { id: fx.inventoryB }],
    });
    await updateInvoiceFull(client, id, {
      containers: [
        { inventory_id: fx.inventoryA, sale_price: '1000' },
        { inventory_id: fx.inventoryB, sale_price: '2000' },
      ],
    });
    expect(await inventoryState(fx.inventoryA)).toBe('sold');
    expect(await inventoryState(fx.inventoryB)).toBe('sold');

    await deleteInvoiceCascade(client, id);

    expect(await inventoryState(fx.inventoryA)).toBe('available');
    expect(await inventoryState(fx.inventoryB)).toBe('available');
    expect(await soldRowExists(fx.inventoryA)).toBe(false);
    expect(await soldRowExists(fx.inventoryB)).toBe(false);
    const { rows } = await client.query(
      'SELECT 1 FROM invoices WHERE invoice_id = $1',
      [id],
    );
    expect(rows.length).toBe(0);
  });
});
