// Integration test for lib/report-resolvers/pnl.ts. resolvePnL reads
// through the shared db singleton (server/db/index.js), which grabs its
// own pool connection per call rather than accepting an injected client
// like the other libs under test here — so isolating it under one
// transaction means redirecting db.query to the per-test client instead
// of just passing one in, but the BEGIN/ROLLBACK boundary is the same.

import 'dotenv/config';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PoolClient } from 'pg';
import pool from '../../../db/pool.js';

let client: PoolClient;

vi.mock('../../../db/index.js', () => ({
  default: {
    query: (text: string, params?: unknown[]) => client.query(text, params),
  },
}));

const { resolvePnL } = await import('../../../lib/report-resolvers/pnl.js');

const PERIOD = { granularity: 'month' as const, period: '2099-06' };
const INVOICE_DATE = '2099-06-15';

interface Fixture {
  saleCompanyId: number;
  releaseId: number;
  clientId: number;
  inventoryId: number;
  soldId: number;
}

let fx: Fixture;

const insertFixture = async (c: PoolClient): Promise<Fixture> => {
  const { rows: [sc] } = await c.query<{ sale_company_id: number }>(
    `INSERT INTO sale_companies (sale_company_name)
     VALUES ('pnl-test-' || gen_random_uuid()::text)
     RETURNING sale_company_id`,
  );
  const { rows: [rel] } = await c.query<{ release_number_id: number }>(
    `INSERT INTO release_numbers (release_number_value, sale_company_id)
     VALUES ('PNL-' || gen_random_uuid()::text, $1)
     RETURNING release_number_id`,
    [sc.sale_company_id],
  );
  const { rows: [cl] } = await c.query<{ id: number }>(
    `INSERT INTO clients (client_name) VALUES ('pnl-test-client') RETURNING id`,
  );
  // acquisition_price $1200, sale_price $2000, trucking $300 — the audit's
  // own worked example (reported $1,100 profit vs. correct $800).
  const { rows: [inv] } = await c.query<{ id: number }>(
    `INSERT INTO inventory (unit_number, size, damage, release_number_id, sale_company_id, state, acquisition_price, is_pending_audit)
     VALUES ('PNLTEST', '40HC', 'WWT', $1, $2, 'sold', 1200, false)
     RETURNING id`,
    [rel.release_number_id, sc.sale_company_id],
  );
  const { rows: [sold] } = await c.query<{ id: number }>(
    `INSERT INTO sold (inventory_id, sale_price, trucking_rate)
     VALUES ($1, 2000, 300)
     RETURNING id`,
    [inv.id],
  );
  return {
    saleCompanyId: sc.sale_company_id,
    releaseId: rel.release_number_id,
    clientId: cl.id,
    inventoryId: inv.id,
    soldId: sold.id,
  };
};

const insertInvoice = async (
  c: PoolClient,
  clientId: number,
  containerId: number,
  subtotal: number,
): Promise<number> => {
  const invoiceNumber = 9_000_000 + Math.floor(Math.random() * 900_000);
  const { rows: [i] } = await c.query<{ invoice_id: number }>(
    `INSERT INTO invoices (invoice_number, client_id, invoice_date, subtotal)
     VALUES ($1, $2, $3, $4)
     RETURNING invoice_id`,
    [invoiceNumber, clientId, INVOICE_DATE, subtotal],
  );
  await c.query(
    `INSERT INTO invoice_containers (invoice_id, container_id) VALUES ($1, $2)`,
    [i.invoice_id, containerId],
  );
  return i.invoice_id;
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
  fx = await insertFixture(client);
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

describe('resolvePnL sales revenue', () => {
  it('excludes the trucking pass-through from revenue', async () => {
    // Invoice subtotal bakes in sale_price (2000) + trucking (300).
    await insertInvoice(client, fx.clientId, fx.inventoryId, 2300);
    const data = await resolvePnL(PERIOD, 1);
    expect(data.sales.trucking).toBe(300);
    expect(data.sales.cost).toBe(1200);
    expect(data.sales.revenue).toBe(2000);
    expect(data.sales.revenue - data.sales.cost).toBe(800);
  });

  it('subtracts trucking independently of modification revenue', async () => {
    await client.query(
      `INSERT INTO sold_modifications (sold_id, description, price) VALUES ($1, 'insulation', 150)`,
      [fx.soldId],
    );
    // Subtotal bakes in sale_price (2000) + trucking (300) + mod (150).
    await insertInvoice(client, fx.clientId, fx.inventoryId, 2450);
    const data = await resolvePnL(PERIOD, 1);
    expect(data.sales.mod_revenue).toBe(150);
    expect(data.sales.trucking).toBe(300);
    expect(data.sales.revenue).toBe(2000);
  });
});
