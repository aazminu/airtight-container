// Local-only smoke test for PR 3.2: render an invoice PDF without
// touching S3, write to /tmp so we can open it and eyeball the output.
//
//   $ cd server
//   $ npx tsx scripts/smoke-pdf.ts                # defaults to invoice #202604009
//   $ npx tsx scripts/smoke-pdf.ts 202605005      # specific invoice number
//
// Requires:
//   - DATABASE_URL set in server/.env (read by db/index.js)
//   - client/dist-server/ exists (run `npm run build:server-template`
//     from client/ first)

import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import db from '../db/index.js';
import { renderInvoicePdf, closeBrowser } from '../lib/pdf.js';

const TARGET_INVOICE_NUMBER = Number(process.argv[2] ?? 202604009);

async function main() {
  const lookup = await db.query(
    'SELECT invoice_id FROM invoices WHERE invoice_number = $1',
    [TARGET_INVOICE_NUMBER],
  );
  if (lookup.rows.length === 0) {
    console.error(`No invoice found with invoice_number=${TARGET_INVOICE_NUMBER}`);
    process.exit(1);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoiceId: number = (lookup.rows as any[])[0].invoice_id;
  const startedAt = Date.now();
  console.log(
    `Rendering invoice #${TARGET_INVOICE_NUMBER} (id ${invoiceId}) ...`,
  );
  const pdf = await renderInvoicePdf(invoiceId);
  const out = path.join(os.tmpdir(), `invoice-${TARGET_INVOICE_NUMBER}.pdf`);
  await writeFile(out, pdf);
  console.log(`OK — ${pdf.length} bytes in ${Date.now() - startedAt}ms`);
  console.log(`Wrote ${out}`);
}

main()
  .catch((err) => {
    console.error('Smoke run failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closeBrowser();
    await db.pool?.end?.();
    // Force exit — Puppeteer occasionally leaves a stray Chromium
    // handle that keeps the event loop alive after .close().
    process.exit(0);
  });
