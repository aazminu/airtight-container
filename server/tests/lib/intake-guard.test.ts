// Tests for lib/intake-guard.ts. normalizeUnitNumber is pure; the
// findAvailableDuplicate cases run against the local DB with the same
// per-test BEGIN/ROLLBACK isolation as outbound-from-delivery.test.ts.
// Unit numbers are UUID-tagged so a real 'available' row in the dev DB
// can never make a duplicate check pass by accident.

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
import {
  findAvailableDuplicate,
  normalizeUnitNumber,
} from '../../lib/intake-guard.js';

describe('normalizeUnitNumber', () => {
  it('trims and upper-cases', () => {
    expect(normalizeUnitNumber('  tcku 426283-8 ')).toBe('TCKU 426283-8');
  });
  it('returns empty string for null/undefined/blank', () => {
    expect(normalizeUnitNumber(null)).toBe('');
    expect(normalizeUnitNumber(undefined)).toBe('');
    expect(normalizeUnitNumber('   ')).toBe('');
  });
});

let client: PoolClient;
let saleCompanyId: number;
let releaseId: number;
let unit: string; // unique per test

const insert = async (
  state: 'available' | 'sold' | 'outbound' | 'hold' | 'pending',
  unitNumber: string,
): Promise<number> => {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO inventory
       (unit_number, size, damage, release_number_id, sale_company_id, state, is_pending_audit)
     VALUES ($1, '40HC', 'WWT', $2, $3, $4, false)
     RETURNING id`,
    [unitNumber, releaseId, saleCompanyId, state],
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
  const { rows: [sc] } = await client.query<{ sale_company_id: number }>(
    `INSERT INTO sale_companies (sale_company_name)
     VALUES ('dup-test-' || gen_random_uuid()::text)
     RETURNING sale_company_id`,
  );
  saleCompanyId = sc.sale_company_id;
  const { rows: [rel] } = await client.query<{ release_number_id: number }>(
    `INSERT INTO release_numbers (release_number_value, sale_company_id)
     VALUES ('DUP-' || gen_random_uuid()::text, $1)
     RETURNING release_number_id`,
    [saleCompanyId],
  );
  releaseId = rel.release_number_id;
  const { rows: [u] } = await client.query<{ u: string }>(
    `SELECT 'ZZTU ' || substr(replace(gen_random_uuid()::text,'-',''),1,6) || '-0' AS u`,
  );
  unit = u.u;
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

describe('findAvailableDuplicate', () => {
  it('flags an existing available row (returns its id)', async () => {
    const id = await insert('available', unit);
    expect(await findAvailableDuplicate(client, unit)).toBe(id);
  });

  it('matches case- and whitespace-insensitively', async () => {
    const id = await insert('available', unit);
    expect(
      await findAvailableDuplicate(client, `  ${unit.toLowerCase()}  `),
    ).toBe(id);
  });

  it('allows churn: only sold/outbound copies do not block', async () => {
    await insert('sold', unit);
    await insert('outbound', unit);
    expect(await findAvailableDuplicate(client, unit)).toBeNull();
  });

  it('returns null when the unit number is not present at all', async () => {
    expect(await findAvailableDuplicate(client, unit)).toBeNull();
  });

  it('returns null for blank input', async () => {
    await insert('available', unit);
    expect(await findAvailableDuplicate(client, '   ')).toBeNull();
  });
});
