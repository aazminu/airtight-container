import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderReportPdf, closeReportBrowser } from '../lib/report-pdf.js';
import { resolveReport } from '../lib/report-resolvers/index.js';
import { rowsOf } from '../lib/report-resolvers/types.js';
import db from '../db/index.js';

async function main() {
  // Pick the release with the most inventory so the table has rows to
  // show. Falls back to any release.
  const res = await db.query(
    `SELECT rn.release_number_id, COUNT(inv.id)::int AS n
     FROM release_numbers rn
     LEFT JOIN inventory inv ON inv.release_number_id = rn.release_number_id
     GROUP BY rn.release_number_id
     ORDER BY n DESC, rn.release_number_id ASC
     LIMIT 1`,
  );
  const rows = rowsOf<{ release_number_id: number; n: number }>(res);
  if (rows.length === 0) {
    console.error('No releases found');
    return;
  }
  const id = rows[0].release_number_id;
  console.log(`release_id=${id} (n=${rows[0].n})`);

  const resolved = await resolveReport(
    'release_summary',
    { release_id: id },
    999,
  );
  if (resolved.report_type !== 'release_summary') return;
  console.log(
    `quota=${resolved.data.quota}, filled=${resolved.data.filled_count}, remaining=${resolved.data.remaining}, containers=${resolved.data.containers.length}`,
  );

  const buf = await renderReportPdf('release_summary', resolved.data);
  const out = path.join('/tmp', 'smoke-release_summary.pdf');
  await writeFile(out, buf);
  console.log(`wrote ${out} (${buf.length} bytes)`);

  await closeReportBrowser();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
