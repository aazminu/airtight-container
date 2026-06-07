import type { Client } from 'pg';

// Validation callback for the CURRENT deployment's migration(s).
//
// Runs inside the migration transaction (scripts/migrate.ts), against the
// already-migrated schema but BEFORE COMMIT. Throw to abort and roll the
// whole migration back. Keep it read-only (SELECT/assert) — no writes to
// prod, even inside the txn.
//
// >>> Update the body of this file for each deployment that ships a
//     migration. Right now it validates 0024 (modification quantity).
export async function check(client: Client): Promise<void> {
  const assert = (cond: boolean, msg: string): void => {
    if (!cond) throw new Error(`validation failed: ${msg}`);
  };

  // 0024 — both modification tables gain a NOT NULL integer `quantity`
  // defaulting to 1, so every pre-existing row keeps its price × 1 total.
  for (const table of ['quote_line_modifications', 'sold_modifications']) {
    const { rows } = await client.query(
      `SELECT data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'quantity'`,
      [table],
    );
    assert(rows.length === 1, `${table}.quantity column is missing`);
    assert(
      rows[0].data_type === 'integer',
      `${table}.quantity is ${rows[0].data_type}, expected integer`,
    );
    assert(rows[0].is_nullable === 'NO', `${table}.quantity must be NOT NULL`);
    assert(
      String(rows[0].column_default ?? '').startsWith('1'),
      `${table}.quantity default should be 1 (got ${rows[0].column_default})`,
    );

    // table names are hard-coded literals above — safe to interpolate.
    const { rows: bad } = await client.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE quantity IS NULL OR quantity < 1`,
    );
    assert(
      bad[0].n === 0,
      `${table} has ${bad[0].n} row(s) with NULL or < 1 quantity after migration`,
    );
  }
}
