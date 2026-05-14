// End-to-end smoke for the report PDF pipeline:
//   1. Insert a reports row + run the matching resolver
//   2. renderReportPdf the resolved data via Puppeteer
//   3. Write the PDF to /tmp so we can eyeball it before wiring up S3
//
// Skips S3 to avoid needing creds for the smoke. The real route at
// POST /api/v2/report/:id/pdf hits S3 directly.

import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderReportPdf, closeReportBrowser } from '../lib/report-pdf.js';
import { resolveReport } from '../lib/report-resolvers/index.js';
import { rowsOf } from '../lib/report-resolvers/types.js';
import db from '../db/index.js';

async function main() {
  const tmpDir = '/tmp';

  // Pick a real container for delivery_sheet smoke.
  const dRes = await db.query(
    `SELECT ic.container_id
     FROM invoice_containers ic
     ORDER BY ic.container_id DESC
     LIMIT 1`,
  );
  const dRows = rowsOf<{ container_id: number }>(dRes);
  if (dRows.length === 0) {
    console.error('No invoice_containers row found, skipping delivery smoke');
    return;
  }
  const containerId = dRows[0].container_id;

  const cases = [
    {
      type: 'delivery_sheet' as const,
      parameters: { container_id: containerId },
    },
    {
      type: 'pnl' as const,
      parameters: {
        granularity: 'month' as const,
        period: new Date().toISOString().slice(0, 7),
      },
    },
    {
      type: 'io_report' as const,
      parameters: {
        start_date: new Date(Date.now() - 90 * 86_400_000)
          .toISOString()
          .slice(0, 10),
        end_date: new Date().toISOString().slice(0, 10),
      },
    },
  ];

  for (const c of cases) {
    console.log(`\n── ${c.type} ──`);
    const resolved = await resolveReport(c.type, c.parameters, 1);
    // The resolver branches by report_type at compile time but here
    // we know it returns the matching arm — pass data through as-is.
    const buf = await renderReportPdf(
      resolved.report_type as 'delivery_sheet' | 'io_report' | 'pnl' | 'sh_statement',
      resolved.data,
    );
    const out = path.join(tmpDir, `smoke-${c.type}.pdf`);
    await writeFile(out, buf);
    console.log(`wrote ${out} (${buf.length} bytes)`);
  }

  await closeReportBrowser();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
