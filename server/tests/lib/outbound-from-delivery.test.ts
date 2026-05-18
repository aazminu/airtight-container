// Integration tests for lib/outbound-from-delivery.ts. Same per-test
// BEGIN/ROLLBACK pattern as invoice-ops.test.ts so each test gets a
// clean slate against the local DB.

import 'dotenv/config';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import type { PoolClient } from 'pg';
import pool from '../../db/pool.js';
import { applyOutboundFromDeliverySheets } from '../../lib/outbound-from-delivery.js';

let client: PoolClient;

interface Fixtures {
  clientId: number;
  saleCompanyId: number;
  releaseId: number;
  containerA: number; // 'sold', past-dated delivery sheet → should flip
  containerB: number; // 'sold', future-dated delivery sheet → should not
  containerC: number; // 'sold', no delivery sheet → should not
  containerD: number; // already 'outbound' → should stay outbound
}

let fx: Fixtures;

const insertContainer = async (
  c: PoolClient,
  state: 'sold' | 'outbound',
  saleCompanyId: number,
  releaseId: number,
  label: string,
): Promise<number> => {
  const { rows } = await c.query<{ id: number }>(
    `INSERT INTO inventory
       (unit_number, size, damage, release_number_id, sale_company_id, state, is_pending_audit)
     VALUES ($1, '40HC', 'WWT', $2, $3, $4, false)
     RETURNING id`,
    [label, releaseId, saleCompanyId, state],
  );
  await c.query(
    `INSERT INTO sold (inventory_id) VALUES ($1)`,
    [rows[0].id],
  );
  return rows[0].id;
};

const insertDeliverySheet = async (
  c: PoolClient,
  containerId: number,
  deliveryDateIso: string,
): Promise<number> => {
  const { rows } = await c.query<{ id: number }>(
    `INSERT INTO reports (report_type, parameters, resolved_data)
     VALUES ('delivery_sheet', $1::jsonb, $2::jsonb)
     RETURNING id`,
    [
      JSON.stringify({ container_id: containerId, delivery_date: deliveryDateIso }),
      JSON.stringify({ delivery_date: deliveryDateIso, container: { unit_number: '' } }),
    ],
  );
  return rows[0].id;
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
  const { rows: [cl] } = await client.query<{ id: number }>(
    `INSERT INTO clients (client_name) VALUES ('out-test') RETURNING id`,
  );
  const { rows: [sc] } = await client.query<{ sale_company_id: number }>(
    `INSERT INTO sale_companies (sale_company_name)
     VALUES ('out-test-' || gen_random_uuid()::text)
     RETURNING sale_company_id`,
  );
  const { rows: [rel] } = await client.query<{ release_number_id: number }>(
    `INSERT INTO release_numbers (release_number_value, sale_company_id)
     VALUES ('OUT-' || gen_random_uuid()::text, $1)
     RETURNING release_number_id`,
    [sc.sale_company_id],
  );

  const containerA = await insertContainer(
    client,
    'sold',
    sc.sale_company_id,
    rel.release_number_id,
    'OUT-A',
  );
  const containerB = await insertContainer(
    client,
    'sold',
    sc.sale_company_id,
    rel.release_number_id,
    'OUT-B',
  );
  const containerC = await insertContainer(
    client,
    'sold',
    sc.sale_company_id,
    rel.release_number_id,
    'OUT-C',
  );
  const containerD = await insertContainer(
    client,
    'outbound',
    sc.sale_company_id,
    rel.release_number_id,
    'OUT-D',
  );

  // A: past-dated sheet → eligible
  await insertDeliverySheet(client, containerA, '2020-01-01T12:00:00Z');
  // B: future-dated sheet → not eligible
  await insertDeliverySheet(client, containerB, '2099-12-31T12:00:00Z');
  // C: no sheet at all
  // D: past-dated sheet but already outbound — verify one-way
  await insertDeliverySheet(client, containerD, '2020-01-01T12:00:00Z');

  fx = {
    clientId: cl.id,
    saleCompanyId: sc.sale_company_id,
    releaseId: rel.release_number_id,
    containerA,
    containerB,
    containerC,
    containerD,
  };
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

const stateOf = async (id: number): Promise<string> => {
  const { rows } = await client.query<{ state: string }>(
    'SELECT state FROM inventory WHERE id = $1',
    [id],
  );
  return rows[0].state;
};

const outboundDateOf = async (id: number): Promise<string | null> => {
  const { rows } = await client.query<{ outbound_date: string | null }>(
    'SELECT outbound_date FROM sold WHERE inventory_id = $1',
    [id],
  );
  return rows[0]?.outbound_date ?? null;
};

describe('applyOutboundFromDeliverySheets', () => {
  it('flips a sold container with a past-dated delivery sheet to outbound', async () => {
    const r = await applyOutboundFromDeliverySheets({ client });
    expect(r.flipped).toBeGreaterThanOrEqual(1);
    expect(r.flipped_ids).toContain(fx.containerA);
    expect(await stateOf(fx.containerA)).toBe('outbound');
  });

  it('does not flip a sold container whose delivery sheet is future-dated', async () => {
    await applyOutboundFromDeliverySheets({ client });
    expect(await stateOf(fx.containerB)).toBe('sold');
  });

  it('does not flip a sold container that has no delivery sheet', async () => {
    await applyOutboundFromDeliverySheets({ client });
    expect(await stateOf(fx.containerC)).toBe('sold');
  });

  it('leaves an already-outbound container alone (one-way)', async () => {
    await applyOutboundFromDeliverySheets({ client });
    expect(await stateOf(fx.containerD)).toBe('outbound');
  });

  it('stamps sold.outbound_date when flipping (legacy compat)', async () => {
    expect(await outboundDateOf(fx.containerA)).toBeNull();
    await applyOutboundFromDeliverySheets({ client });
    const stamped = await outboundDateOf(fx.containerA);
    expect(stamped).not.toBeNull();
    expect(new Date(stamped!).getTime()).toBe(
      new Date('2020-01-01T12:00:00Z').getTime(),
    );
  });

  it('is idempotent — running twice flips zero on the second run', async () => {
    const first = await applyOutboundFromDeliverySheets({ client });
    expect(first.flipped).toBeGreaterThanOrEqual(1);
    const second = await applyOutboundFromDeliverySheets({ client });
    expect(second.flipped).toBe(0);
  });

  it('can scope to a single container id', async () => {
    const r = await applyOutboundFromDeliverySheets({
      client,
      containerId: fx.containerA,
    });
    expect(r.flipped_ids).toEqual([fx.containerA]);
    // Other due rows (there shouldn't be any besides A) untouched —
    // but A should have been flipped.
    expect(await stateOf(fx.containerA)).toBe('outbound');
    expect(await stateOf(fx.containerB)).toBe('sold');
    expect(await stateOf(fx.containerC)).toBe('sold');
  });

  it('scoped-call against a non-eligible container is a no-op', async () => {
    const r = await applyOutboundFromDeliverySheets({
      client,
      containerId: fx.containerB, // future-dated sheet → not eligible
    });
    expect(r.flipped).toBe(0);
    expect(r.flipped_ids).toEqual([]);
    expect(await stateOf(fx.containerB)).toBe('sold');
  });

  it('uses the most recent delivery_date when multiple sheets exist for one container', async () => {
    // Add a second, more recent past-dated sheet
    await insertDeliverySheet(client, fx.containerA, '2021-06-15T12:00:00Z');
    await applyOutboundFromDeliverySheets({ client });
    const stamped = await outboundDateOf(fx.containerA);
    expect(new Date(stamped!).getTime()).toBe(
      new Date('2021-06-15T12:00:00Z').getTime(),
    );
  });
});
