// One-shot: normalize every inventory.unit_number to the canonical
// `LLLL ######-#` form (4 letters, space, 6 serial digits, dash, check
// digit). Mirrors the going-forward intake mask in UnitNumberInput.tsx.
//
// Rules:
//   - 4 letters + 7 digits  →  `LLLL ######-#`     (ISO 6346 with check digit)
//   - 4 letters + 6 digits  →  `LLLL ######`       (no check digit — drop trailing `-`)
//   - everything else       →  leave as-is         (TS digit-only labels,
//                                                  typo'd rows handled by
//                                                  the audit fuzzy-fix step)
//
// Usage (run from inside server/):
//   npx tsx scripts/normalize-unit-numbers.ts            dry run
//   npx tsx scripts/normalize-unit-numbers.ts --apply    commit changes
//
// Idempotent: already-canonical values normalize to themselves and skip.

import 'dotenv/config';
import { db } from '../db/drizzle.js';
import { sql } from 'drizzle-orm';

const apply = process.argv.includes('--apply');

const normalize = (raw: string): string => {
  const stripped = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  // Standard 11-char ISO 6346
  if (/^[A-Z]{4}[0-9]{7}$/.test(stripped)) {
    return `${stripped.slice(0, 4)} ${stripped.slice(4, 10)}-${stripped.slice(10)}`;
  }
  // 10-char no-check variant
  if (/^[A-Z]{4}[0-9]{6}$/.test(stripped)) {
    return `${stripped.slice(0, 4)} ${stripped.slice(4)}`;
  }
  return raw;
};

async function main() {
  const result = await db.execute(
    sql`SELECT id, unit_number FROM inventory ORDER BY id`,
  );
  const rows = result.rows as { id: number; unit_number: string }[];

  const changes = rows
    .map((r) => ({ id: r.id, from: r.unit_number, to: normalize(r.unit_number) }))
    .filter((c) => c.to !== c.from);

  console.log(
    `Scanned ${rows.length} inventory rows; ${changes.length} need normalization.`,
  );
  for (const c of changes) {
    console.log(`  #${c.id}: ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`);
  }

  if (!apply) {
    console.log('\nDry run — no changes written. Re-run with --apply to commit.');
    return;
  }

  await db.transaction(async (tx) => {
    for (const c of changes) {
      await tx.execute(
        sql`UPDATE inventory SET unit_number = ${c.to} WHERE id = ${c.id}`,
      );
    }
  });
  console.log(`\nApplied ${changes.length} updates.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
