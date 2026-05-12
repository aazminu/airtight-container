// Phase 1 PR 1.3 — data backfill script for schema 2.0.
//
// Usage:
//   npx tsx scripts/migrate-data-v2.ts --emit-address-csv
//     Pass A: parse contacts.contact_address into structured columns,
//     emit migration-data/addresses.csv for manual review. Idempotent.
//
//   npx tsx scripts/migrate-data-v2.ts --apply
//     Pass B: read the (edited) CSV, run all backfill steps inside a
//     single transaction. Hard-fails if the CSV is missing.
//
// Run from inside server/ so that ./db/drizzle.js + .env resolve.

import 'dotenv/config';
import { db } from '../db/drizzle.js';
import { sql } from 'drizzle-orm';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const CSV_PATH = resolve('scripts/migration-data/addresses.csv');

// ---- sale_company normalization ------------------------------------
// Map of raw inventory.sale_company text → canonical sale_companies.sale_company_name.
// Anything in NOISE is treated as null (rows fall through to release-inheritance
// or 'Unknown'). User-confirmed 2026-05-12 — see HANDOFF/PLAN §3.5 step 2.

const NOISE = new Set(['COMPANY', 'N/A', 'TEST', 'RENTAL RETURN', 'rental']);

const NORMALIZE: Record<string, string> = {
  // Triton family
  'Triton': 'Triton',
  'Triton ': 'Triton',
  'TRITON': 'Triton',
  'tRITON': 'Triton',
  'triton': 'Triton',
  'Trison': 'Triton',
  // SeaCube family
  'SeaCube': 'SeaCube',
  'Seacube': 'SeaCube',
  'Seacube ': 'SeaCube',
  'SEacube': 'SeaCube',
  'seacube': 'SeaCube',
  'sEACUBE': 'SeaCube',
  'Seacube rental rtn': 'SeaCube',
  // Flex Box family
  'Flex Box': 'Flex Box',
  'Flex Box ': 'Flex Box',
  'FlexBox': 'Flex Box',
  // existing-already
  'CAI': 'CAI',
  'CHS': 'CHS',
  // new vendors
  '18W': '18W',
  'Beacon': 'Beacon',
  "D'Annunzio": "D'Annunzio",
  'DiFazio': 'DiFazio',
  'LMD': 'LMD',
  'Logitics': 'Logistics', // user-confirmed typo
  'Matthews': 'Matthews',
  'UBPS': 'UBPS',
};

function normalizeSaleCompany(text: string | null | undefined): string | null {
  if (!text) return null;
  if (NOISE.has(text) || NOISE.has(text.trim())) return null;
  if (NORMALIZE[text]) return NORMALIZE[text];
  if (NORMALIZE[text.trim()]) return NORMALIZE[text.trim()];
  // Unmapped: fall back to trimmed value (treated as a new sale_companies row)
  const trimmed = text.trim();
  return trimmed || null;
}

// ---- address parsing ------------------------------------------------

interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  needs_review: boolean;
}

function parseAddress(raw: string | null): ParsedAddress {
  const empty = { street: '', city: '', state: '', zip: '', needs_review: true };
  if (!raw) return empty;
  const text = raw.trim();
  if (!text || text.toUpperCase() === 'N/A') return empty;

  // Tail extraction: capture trailing 2-letter state and optional 5(-4) ZIP
  const tail = text.match(/^(.*?)[\s,]+([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?\s*$/);
  if (!tail) return { ...empty, street: text };

  const beforeState = tail[1].trim();
  const state = tail[2];
  const zip = tail[3] || '';

  // Prefer comma-based street/city split
  const commaParts = beforeState
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (commaParts.length >= 2) {
    const city = commaParts.pop()!;
    const street = commaParts.join(', ');
    return { street, city, state, zip, needs_review: !zip };
  }

  // No reliable comma split — flag for manual review
  return {
    street: beforeState,
    city: '',
    state,
    zip,
    needs_review: true,
  };
}

// ---- helpers -------------------------------------------------------

function step(name: string) {
  console.log(`\n=== ${name} ===`);
}

function assertEq(label: string, actual: number, expected: number) {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${label} — expected ${expected}, got ${actual}`,
    );
  }
  console.log(`  ✓ ${label}: ${actual}`);
}

// ---- Pass A: emit address CSV --------------------------------------

async function emitAddressCsv() {
  step('Pass A: parse contacts.contact_address → CSV');

  const result = await db.execute(sql`
    SELECT contact_id, contact_address FROM contacts ORDER BY contact_id
  `);
  const rows = result.rows as Array<{
    contact_id: number;
    contact_address: string | null;
  }>;

  const records = rows.map((r) => {
    const parsed = parseAddress(r.contact_address);
    return {
      contact_id: r.contact_id,
      original_address: r.contact_address ?? '',
      parsed_street: parsed.street,
      parsed_city: parsed.city,
      parsed_state: parsed.state,
      parsed_zip: parsed.zip,
      needs_review: parsed.needs_review ? 'yes' : '',
    };
  });

  mkdirSync(dirname(CSV_PATH), { recursive: true });
  const csv = stringify(records, {
    header: true,
    columns: [
      'contact_id',
      'original_address',
      'parsed_street',
      'parsed_city',
      'parsed_state',
      'parsed_zip',
      'needs_review',
    ],
  });
  writeFileSync(CSV_PATH, csv);

  const flagged = records.filter((r) => r.needs_review === 'yes').length;
  console.log(`  Wrote ${records.length} rows → ${CSV_PATH}`);
  console.log(`  ${flagged} rows flagged needs_review (edit those in place)`);
}

// ---- Pass B: apply the backfill ------------------------------------

interface AddressCsvRow {
  contact_id: string;
  original_address: string;
  parsed_street: string;
  parsed_city: string;
  parsed_state: string;
  parsed_zip: string;
  needs_review: string;
}

async function apply() {
  if (!existsSync(CSV_PATH)) {
    console.error(
      `Edited CSV not found: ${CSV_PATH}\nRun --emit-address-csv first, edit the file, then re-run --apply.`,
    );
    process.exit(1);
  }

  const csvText = readFileSync(CSV_PATH, 'utf8');
  const addressRecords = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
  }) as AddressCsvRow[];
  const addressById = new Map<number, AddressCsvRow>(
    addressRecords.map((r) => [Number(r.contact_id), r]),
  );

  await db.transaction(async (tx) => {
    // ---- Step 0: cleanup orphan duplicate invoices ----------------
    // Any invoice with zero containers attached AND that shares its
    // invoice_number with another invoice is a known legacy double-
    // submit artifact (PR 0.x didn't have a UNIQUE constraint or a
    // server-side sequence guard). On local data today this is
    // invoice_ids 122 + 123 (invoice_number=202505021, Belleayre
    // Mountain, created within a minute of each other on 2025-05-27).
    // User confirmed 2026-05-12: delete both. The query below is
    // general so it picks up new dups if any appear before prod cutover.
    step('Step 0: cleanup orphan duplicate invoices');
    const cleanedDups = await tx.execute(sql`
      DELETE FROM invoices
      WHERE invoice_id IN (
        SELECT i.invoice_id
        FROM invoices i
        WHERE NOT EXISTS (
          SELECT 1 FROM invoice_containers ic WHERE ic.invoice_id = i.invoice_id
        )
        AND EXISTS (
          SELECT 1 FROM invoices i2
          WHERE i2.invoice_number = i.invoice_number AND i2.invoice_id <> i.invoice_id
        )
      )
    `);
    console.log(`  Deleted ${cleanedDups.rowCount ?? 0} orphan duplicate invoices`);

    // ---- Step 1: populate clients from contacts -------------------
    step('Step 1: populate clients from contacts + edited address CSV');

    const contactRows = (
      await tx.execute(sql`
        SELECT contact_id, contact_name, contact_email, contact_phone
        FROM contacts
        ORDER BY contact_id
      `)
    ).rows as Array<{
      contact_id: number;
      contact_name: string;
      contact_email: string | null;
      contact_phone: string | null;
    }>;

    if (contactRows.length !== addressRecords.length) {
      throw new Error(
        `CSV row count (${addressRecords.length}) does not match contacts row count (${contactRows.length}). Re-emit the CSV.`,
      );
    }

    let inserted = 0;
    for (const c of contactRows) {
      const addr = addressById.get(c.contact_id);
      if (!addr) {
        throw new Error(`No CSV row for contact_id=${c.contact_id}`);
      }
      const insertRes = await tx.execute(sql`
        INSERT INTO clients (id, client_name, contact_email, contact_phone, street, city, state, zip)
        VALUES (
          ${c.contact_id},
          ${c.contact_name},
          ${c.contact_email},
          ${c.contact_phone},
          ${addr.parsed_street || null},
          ${addr.parsed_city || null},
          ${addr.parsed_state || null},
          ${addr.parsed_zip || null}
        )
        ON CONFLICT (id) DO UPDATE SET
          client_name = EXCLUDED.client_name,
          contact_email = EXCLUDED.contact_email,
          contact_phone = EXCLUDED.contact_phone,
          street = EXCLUDED.street,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip = EXCLUDED.zip
        RETURNING (xmax = 0) AS inserted
      `);
      const row = insertRes.rows[0] as { inserted: boolean };
      if (row?.inserted) inserted++;
    }
    // Bump sequence past the highest existing id so future INSERTs don't collide
    await tx.execute(
      sql`SELECT setval('clients_id_seq', GREATEST((SELECT max(id) FROM clients), 1))`,
    );
    console.log(`  Inserted ${inserted} new clients (skipped existing on conflict)`);

    // ---- Step 2: ensure sale_companies has every needed row -------
    step('Step 2: insert missing sale_companies (incl. Unknown fallback)');

    const existing = new Set(
      (
        (await tx.execute(sql`SELECT sale_company_name FROM sale_companies`))
          .rows as Array<{ sale_company_name: string }>
      ).map((r) => r.sale_company_name),
    );

    const required = new Set<string>(['Unknown']);
    const invSaleCompanies = (
      await tx.execute(
        sql`SELECT DISTINCT sale_company FROM inventory WHERE sale_company IS NOT NULL`,
      )
    ).rows as Array<{ sale_company: string }>;
    for (const r of invSaleCompanies) {
      const norm = normalizeSaleCompany(r.sale_company);
      if (norm) required.add(norm);
    }

    let newCompanies = 0;
    for (const name of required) {
      if (!existing.has(name)) {
        await tx.execute(
          sql`INSERT INTO sale_companies (sale_company_name) VALUES (${name})`,
        );
        newCompanies++;
      }
    }
    console.log(`  Inserted ${newCompanies} new sale_companies rows`);

    // Build name → id map for downstream steps
    const allCompanies = (
      await tx.execute(
        sql`SELECT sale_company_id, sale_company_name FROM sale_companies`,
      )
    ).rows as Array<{ sale_company_id: number; sale_company_name: string }>;
    const companyByName = new Map<string, number>(
      allCompanies.map((r) => [r.sale_company_name, r.sale_company_id]),
    );

    // ---- Step 3a: create release_numbers for orphan acceptance_numbers ---
    step('Step 3a: insert release_numbers for orphan acceptance_numbers');

    const orphans = (
      await tx.execute(sql`
        SELECT DISTINCT i.acceptance_number,
               (SELECT i2.sale_company FROM inventory i2 WHERE i2.acceptance_number = i.acceptance_number LIMIT 1) AS sample_sale_company
        FROM inventory i
        WHERE i.acceptance_number IS NOT NULL AND i.acceptance_number <> ''
          AND NOT EXISTS (
            SELECT 1 FROM release_numbers rn
            WHERE rn.release_number_value = i.acceptance_number
          )
        ORDER BY i.acceptance_number
      `)
    ).rows as Array<{
      acceptance_number: string;
      sample_sale_company: string | null;
    }>;

    let orphanCount = 0;
    for (const o of orphans) {
      const norm = normalizeSaleCompany(o.sample_sale_company);
      const companyName = norm ?? 'Unknown';
      const companyId = companyByName.get(companyName);
      if (!companyId) {
        throw new Error(`Missing sale_company_id for "${companyName}"`);
      }
      await tx.execute(sql`
        INSERT INTO release_numbers (release_number_value, release_number_count, is_complete, sale_company_id)
        VALUES (${o.acceptance_number}, 0, true, ${companyId})
        ON CONFLICT (release_number_value) DO NOTHING
      `);
      orphanCount++;
    }
    console.log(`  Inserted ${orphanCount} release_numbers for orphan acceptance_numbers`);

    // ---- Step 3b: LEGACY-UNKNOWN placeholder for empty acceptance --------
    step('Step 3b: LEGACY-UNKNOWN placeholder for empty acceptance_number');

    const tritonId = companyByName.get('Triton');
    if (!tritonId) throw new Error('Triton sale_company missing — cannot pair placeholder');
    await tx.execute(sql`
      INSERT INTO release_numbers (release_number_value, release_number_count, is_complete, sale_company_id)
      VALUES ('LEGACY-UNKNOWN', 0, true, ${tritonId})
      ON CONFLICT (release_number_value) DO NOTHING
    `);
    console.log('  LEGACY-UNKNOWN placeholder ensured');

    // ---- Step 3c: populate inventory.release_number_id ------------------
    step('Step 3c: populate inventory.release_number_id');

    const matched = await tx.execute(sql`
      UPDATE inventory i
      SET release_number_id = rn.release_number_id
      FROM release_numbers rn
      WHERE rn.release_number_value = i.acceptance_number
        AND i.release_number_id IS NULL
    `);
    console.log(`  Matched ${matched.rowCount ?? 0} inventory rows via acceptance_number`);

    const legacyId = (
      (
        await tx.execute(
          sql`SELECT release_number_id FROM release_numbers WHERE release_number_value = 'LEGACY-UNKNOWN'`,
        )
      ).rows as Array<{ release_number_id: number }>
    )[0]?.release_number_id;
    const legacyAssigned = await tx.execute(sql`
      UPDATE inventory
      SET release_number_id = ${legacyId}
      WHERE release_number_id IS NULL
    `);
    console.log(`  Pointed ${legacyAssigned.rowCount ?? 0} remaining rows at LEGACY-UNKNOWN`);

    // ---- Step 3d: populate inventory.sale_company_id --------------------
    step('Step 3d: populate inventory.sale_company_id');

    // First pass: inherit from release_numbers when inv.sale_company is null/noise
    const inherited = await tx.execute(sql`
      UPDATE inventory i
      SET sale_company_id = rn.sale_company_id
      FROM release_numbers rn
      WHERE rn.release_number_id = i.release_number_id
        AND i.sale_company_id IS NULL
        AND (
          i.sale_company IS NULL
          OR i.sale_company = ''
          OR i.sale_company IN ('COMPANY','N/A','TEST','RENTAL RETURN','rental')
        )
    `);
    console.log(`  Inherited sale_company_id from release for ${inherited.rowCount ?? 0} rows`);

    // Second pass: normalize inv.sale_company text for everything else
    const remaining = (
      await tx.execute(sql`
        SELECT id, sale_company FROM inventory WHERE sale_company_id IS NULL
      `)
    ).rows as Array<{ id: number; sale_company: string | null }>;

    let normalizedAssigned = 0;
    for (const r of remaining) {
      const norm = normalizeSaleCompany(r.sale_company);
      const companyName = norm ?? 'Unknown';
      const companyId = companyByName.get(companyName);
      if (!companyId) throw new Error(`Missing sale_company_id for "${companyName}"`);
      await tx.execute(
        sql`UPDATE inventory SET sale_company_id = ${companyId} WHERE id = ${r.id}`,
      );
      normalizedAssigned++;
    }
    console.log(`  Assigned sale_company_id to ${normalizedAssigned} remaining rows via normalization`);

    // ---- Step 4: invoice snapshot totals --------------------------------
    step('Step 4: compute and snapshot invoice totals');

    // Legacy formula (from client/src/components/forms/InvoiceForm.jsx):
    //   subTotal = sum of floor(sale_price) + floor(modification_price) + floor(trucking_rate)
    //   tax_rate = 0.06625 if invoice_taxed else 0
    //   tax_amount = subTotal * tax_rate
    //   cc_fee_rate = 0.035 if invoice_credit else 0
    //   cc_fee_amount = (subTotal + tax_amount) * cc_fee_rate
    //   total = subTotal + tax_amount + cc_fee_amount
    // Using COALESCE so this runs cleanly regardless of step 5's nullification order.
    const snapshotResult = await tx.execute(sql`
      WITH per_invoice AS (
        SELECT
          ic.invoice_id,
          SUM(
            floor(COALESCE(s.sale_price, 0)) +
            floor(COALESCE(s.modification_price, 0)) +
            floor(COALESCE(s.trucking_rate, 0))
          )::numeric AS subtotal
        FROM invoice_containers ic
        JOIN sold s ON s.inventory_id = ic.container_id
        GROUP BY ic.invoice_id
      ),
      with_totals AS (
        SELECT
          inv.invoice_id,
          COALESCE(p.subtotal, 0) AS subtotal,
          CASE WHEN inv.invoice_taxed THEN 0.06625::numeric ELSE 0 END AS tax_rate,
          CASE WHEN COALESCE(inv.invoice_credit, false) THEN 0.035::numeric ELSE 0 END AS cc_fee_rate
        FROM invoices inv
        LEFT JOIN per_invoice p ON p.invoice_id = inv.invoice_id
      )
      UPDATE invoices i
      SET
        subtotal = w.subtotal,
        tax_rate = w.tax_rate,
        tax_amount = w.subtotal * w.tax_rate,
        cc_fee_rate = w.cc_fee_rate,
        cc_fee_amount = (w.subtotal + (w.subtotal * w.tax_rate)) * w.cc_fee_rate,
        total = w.subtotal + (w.subtotal * w.tax_rate) + ((w.subtotal + (w.subtotal * w.tax_rate)) * w.cc_fee_rate)
      FROM with_totals w
      WHERE i.invoice_id = w.invoice_id
    `);
    console.log(`  Snapshotted totals on ${snapshotResult.rowCount ?? 0} invoices`);

    // ---- Step 5: nullify sold.modification_price = 0 --------------------
    step('Step 5: nullify sold.modification_price = 0 rows');
    const modNulled = await tx.execute(sql`
      UPDATE sold SET modification_price = NULL WHERE modification_price = 0
    `);
    console.log(`  Nullified ${modNulled.rowCount ?? 0} sold.modification_price = 0 rows`);

    // ---- Step 6: is_pending_audit = false on all legacy inventory -------
    step('Step 6: is_pending_audit = false on legacy inventory');
    const auditReset = await tx.execute(sql`
      UPDATE inventory SET is_pending_audit = false WHERE is_pending_audit = true
    `);
    console.log(`  Set is_pending_audit=false on ${auditReset.rowCount ?? 0} rows`);

    // ---- Step 7: is_complete = true on count-0 release_numbers ---------
    step('Step 7: is_complete = true on count-0 release_numbers');
    const completed = await tx.execute(sql`
      UPDATE release_numbers SET is_complete = true, completed_at = COALESCE(completed_at, now())
      WHERE release_number_count = 0 AND is_complete = false
    `);
    console.log(`  Marked ${completed.rowCount ?? 0} release_numbers complete`);

    // ---- Step 8: nullify sold.outbound_date sentinel --------------------
    step('Step 8: nullify sold.outbound_date sentinel (2024-01-01)');
    const sentinelNulled = await tx.execute(sql`
      UPDATE sold SET outbound_date = NULL
      WHERE outbound_date = '2024-01-01 00:00:00+00'::timestamptz
    `);
    console.log(`  Nullified ${sentinelNulled.rowCount ?? 0} sold.outbound_date sentinels`);

    // ---- Final assertions: PR 1.6's NOT NULL constraints will be safe ---
    step('Final assertions');

    const stats = (
      await tx.execute(sql`
        SELECT
          (SELECT count(*) FROM inventory WHERE release_number_id IS NULL) AS inv_null_release,
          (SELECT count(*) FROM inventory WHERE sale_company_id IS NULL) AS inv_null_sale_company,
          (SELECT count(*) FROM invoices WHERE subtotal IS NULL) AS inv_null_subtotal,
          (SELECT count(DISTINCT invoice_number) FROM invoices) AS distinct_invoice_numbers,
          (SELECT count(*) FROM invoices) AS total_invoices
      `)
    ).rows[0] as Record<string, number>;

    assertEq('inventory rows with NULL release_number_id', Number(stats.inv_null_release), 0);
    assertEq('inventory rows with NULL sale_company_id', Number(stats.inv_null_sale_company), 0);
    assertEq('invoices with NULL subtotal', Number(stats.inv_null_subtotal), 0);
    assertEq(
      'invoice_number uniqueness (for PR 1.6 UNIQUE constraint)',
      Number(stats.distinct_invoice_numbers),
      Number(stats.total_invoices),
    );

    console.log('\nAll assertions passed — PR 1.6 cutover migration will be safe.');
  });
}

// ---- entry point ---------------------------------------------------

const flag = process.argv[2];

try {
  if (flag === '--emit-address-csv') {
    await emitAddressCsv();
  } else if (flag === '--apply') {
    await apply();
  } else {
    console.error(
      `Usage:
  npx tsx scripts/migrate-data-v2.ts --emit-address-csv
  npx tsx scripts/migrate-data-v2.ts --apply`,
    );
    process.exit(2);
  }
  process.exit(0);
} catch (err) {
  console.error('\n[migrate-data-v2] failed:', err);
  process.exit(1);
}
