// One-shot: normalize every clients.contact_phone to the canonical
// `XXX-XXX-XXXX` (+ optional ` EXT. XXXXX`) form using the same normalizer
// the write path uses (lib/phone.ts).
//
// Usage (run from inside server/ so ./db/drizzle.js + .env resolve):
//   npx tsx scripts/normalize-phones.ts            dry-run summary, no writes
//   npx tsx scripts/normalize-phones.ts --apply    apply the changes
//
// Idempotent: already-canonical values normalize to themselves and are skipped.

import 'dotenv/config';
import { db } from '../db/drizzle.js';
import { sql } from 'drizzle-orm';
import { normalizePhone } from '../lib/phone.js';

const apply = process.argv.includes('--apply');

async function main() {
  const result = await db.execute(
    sql`SELECT id, contact_phone FROM clients WHERE contact_phone IS NOT NULL`,
  );
  const rows = result.rows as { id: number; contact_phone: string }[];

  const changes = rows
    .map((r) => ({ id: r.id, from: r.contact_phone, to: normalizePhone(r.contact_phone) }))
    .filter((c) => c.to !== c.from);

  console.log(`Scanned ${rows.length} client phone rows; ${changes.length} need normalization.`);
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
        sql`UPDATE clients SET contact_phone = ${c.to} WHERE id = ${c.id}`,
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
