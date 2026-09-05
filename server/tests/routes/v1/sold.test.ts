// Integration test for routes/v1/sold.js POST /. Mounts the real router
// in a throwaway express app, bypasses Better Auth (checkAdmin) since
// that hits its own DB tables, and redirects the shared db singleton to
// the per-test transactional client — same BEGIN/ROLLBACK isolation as
// the other integration tests in this suite, applied to an HTTP path
// instead of a directly-imported function.

import 'dotenv/config';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
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
import express from 'express';
import pool from '../../../db/pool.js';

let client: PoolClient;

vi.mock('../../../middleware/auth.js', () => ({
  checkAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  checkEmployee: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../../db/index.js', () => ({
  default: {
    query: (text: string, params?: unknown[]) => client.query(text, params),
  },
}));

const { default: soldRouter } = await import('../../../routes/v1/sold.js');

let server: http.Server;
let baseUrl: string;

const insertInventory = async (
  c: PoolClient,
  state: string,
): Promise<number> => {
  const { rows: [sc] } = await c.query<{ sale_company_id: number }>(
    `INSERT INTO sale_companies (sale_company_name)
     VALUES ('sold-test-' || gen_random_uuid()::text)
     RETURNING sale_company_id`,
  );
  const { rows: [rel] } = await c.query<{ release_number_id: number }>(
    `INSERT INTO release_numbers (release_number_value, sale_company_id)
     VALUES ('SOLD-' || gen_random_uuid()::text, $1)
     RETURNING release_number_id`,
    [sc.sale_company_id],
  );
  const { rows: [inv] } = await c.query<{ id: number }>(
    `INSERT INTO inventory (unit_number, size, damage, release_number_id, sale_company_id, state, is_pending_audit)
     VALUES ('SOLDTEST', '40HC', 'WWT', $1, $2, $3, false)
     RETURNING id`,
    [rel.release_number_id, sc.sale_company_id, state],
  );
  return inv.id;
};

const postSold = (body: Record<string, unknown>) =>
  fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  client = await pool.connect();
  const app = express();
  app.use(express.json());
  app.use('/sold', soldRouter);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/sold`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  client.release();
  await pool.end();
});

beforeEach(async () => {
  await client.query('BEGIN');
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

describe('POST /sold', () => {
  it('returns a clean 409 when the container already has a sold row', async () => {
    const inventoryId = await insertInventory(client, 'sold');
    await client.query('INSERT INTO sold (inventory_id, sale_price) VALUES ($1, 1500)', [
      inventoryId,
    ]);

    const res = await postSold({
      id: inventoryId,
      destination: 'Test Yard',
      sale_price: '2000',
      release_number: 'R-1',
      trucking_rate: '300',
      invoice_notes: 'dup test',
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toMatch(/already.*sold/i);
  });

  it('succeeds and marks the container sold on the happy path', async () => {
    const inventoryId = await insertInventory(client, 'available');

    const res = await postSold({
      id: inventoryId,
      destination: 'Test Yard',
      sale_price: '2000',
      release_number: 'R-1',
      trucking_rate: '300',
      invoice_notes: 'happy path',
    });

    expect(res.status).toBe(200);
    const { rows } = await client.query<{ state: string }>(
      'SELECT state FROM inventory WHERE id = $1',
      [inventoryId],
    );
    expect(rows[0].state).toBe('sold');
  });
});
