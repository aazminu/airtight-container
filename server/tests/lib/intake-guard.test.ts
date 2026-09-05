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
  findLiveShDuplicate,
  lockUnitNumber,
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

const insertSh = async (
  state: 'pending' | 'in_storage' | 'checked_out',
  unitNumber: string,
): Promise<number> => {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO sh_inventory
       (unit_number, size, release_number_id, state, is_pending_audit)
     VALUES ($1, '20ft', $2, $3, false)
     RETURNING id`,
    [unitNumber, releaseId, state],
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

// excludeId is what routes/v1/inventory.js PUT /audit/:id and PUT /:id pass
// (the row's own id) so a unit-number rewrite doesn't conflict with itself.
describe('findAvailableDuplicate excludeId (audit/edit-route rename guard)', () => {
  it('rejects a rename into a unit number already available under a different row', async () => {
    const availableId = await insert('available', unit);
    const beingEditedId = await insert('pending', `ZZEDIT-${unit}`);
    expect(await findAvailableDuplicate(client, unit, beingEditedId)).toBe(
      availableId,
    );
  });

  it('a row does not conflict with itself', async () => {
    const id = await insert('available', unit);
    expect(await findAvailableDuplicate(client, unit, id)).toBeNull();
  });

  it('excluding an unrelated id does not mask a real duplicate', async () => {
    const availableId = await insert('available', unit);
    const unrelatedId = await insert('sold', `ZZOTHER-${unit}`);
    expect(await findAvailableDuplicate(client, unit, unrelatedId)).toBe(
      availableId,
    );
  });
});

describe('findLiveShDuplicate', () => {
  it('flags an existing pending box', async () => {
    const id = await insertSh('pending', unit);
    expect(await findLiveShDuplicate(client, unit)).toBe(id);
  });

  it('flags an existing in_storage box', async () => {
    const id = await insertSh('in_storage', unit);
    expect(await findLiveShDuplicate(client, unit)).toBe(id);
  });

  it('allows re-intake after checkout: a checked_out box does not block', async () => {
    await insertSh('checked_out', unit);
    expect(await findLiveShDuplicate(client, unit)).toBeNull();
  });

  it('matches case- and whitespace-insensitively', async () => {
    const id = await insertSh('in_storage', unit);
    expect(
      await findLiveShDuplicate(client, `  ${unit.toLowerCase()}  `),
    ).toBe(id);
  });

  it('a row does not conflict with itself', async () => {
    const id = await insertSh('in_storage', unit);
    expect(await findLiveShDuplicate(client, unit, id)).toBeNull();
  });

  it('returns null for blank input', async () => {
    await insertSh('in_storage', unit);
    expect(await findLiveShDuplicate(client, '   ')).toBeNull();
  });
});

describe('lockUnitNumber', () => {
  it('resolves without throwing for a normal unit number', async () => {
    await expect(lockUnitNumber(client, unit)).resolves.toBeUndefined();
  });

  it('is a no-op for blank input', async () => {
    await expect(lockUnitNumber(client, '   ')).resolves.toBeUndefined();
  });

  it('serializes a concurrent submit for the same unit number', async () => {
    await lockUnitNumber(client, unit);
    const other = await pool.connect();
    try {
      const { rows } = await other.query<{ got: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS got',
        [normalizeUnitNumber(unit)],
      );
      expect(rows[0].got).toBe(false);
    } finally {
      other.release();
    }
  });
});
