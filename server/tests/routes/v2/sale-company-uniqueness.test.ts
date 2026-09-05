// Pins the DB-level contract routes/v2/release.js POST /company (and
// pickup.js's identical handler) depend on for their 409 response: a
// duplicate sale_companies.sale_company_name raises a unique-violation.
//
// Mounting the real router under vitest to exercise the HTTP path
// directly isn't possible here: vi.mock'ing anything in the auth chain
// (middleware/auth.js or auth.js, which pulls in better-auth) corrupts
// Vite's resolution of the router's OTHER, unmocked sibling import,
// middleware/validate.js (a .ts file resolved via a bare .js specifier)
// — a vitest/Vite dependency-resolution quirk pre-dating this fix, not
// a defect in the route code. routes/v1/sold.js has no such sibling
// import and its HTTP-level test (tests/routes/v1/sold.test.ts) works
// fine, so that pattern is used there instead.

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
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import pool from '../../../db/pool.js';

let client: PoolClient;

beforeAll(async () => {
  client = await pool.connect();
});

afterAll(async () => {
  client.release();
  await pool.end();
});

beforeEach(async () => {
  await client.query('BEGIN');
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

describe('sale_companies.sale_company_name uniqueness', () => {
  it('raises a 23505 unique violation on a duplicate name', async () => {
    const name = `dup-co-${randomUUID()}`;
    await client.query('INSERT INTO sale_companies (sale_company_name) VALUES ($1)', [name]);
    await expect(
      client.query('INSERT INTO sale_companies (sale_company_name) VALUES ($1)', [name]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('allows distinct names', async () => {
    await client.query('INSERT INTO sale_companies (sale_company_name) VALUES ($1)', [
      `co-a-${randomUUID()}`,
    ]);
    await expect(
      client.query('INSERT INTO sale_companies (sale_company_name) VALUES ($1)', [
        `co-b-${randomUUID()}`,
      ]),
    ).resolves.toBeDefined();
  });
});
