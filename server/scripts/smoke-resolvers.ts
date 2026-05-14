// Quick smoke that runs each resolver against the local DB and prints
// the resolved shape. Helps confirm SQL + joins are sane before the
// route + PDF + UI layers go in. Not a Vitest test — those will land
// in tests/lib/report-resolvers.test.ts.

import 'dotenv/config';
import { resolveReport } from '../lib/report-resolvers/index.js';
import { rowsOf } from '../lib/report-resolvers/types.js';
import db from '../db/index.js';

async function main() {
  const tests: Array<{ name: string; report_type: string; parameters: unknown }> = [];

  // Pick a real container + invoice for delivery_sheet smoke.
  const dRes = await db.query(
    `SELECT ic.container_id, i.client_id
     FROM invoice_containers ic
     JOIN invoices i ON i.invoice_id = ic.invoice_id
     ORDER BY i.invoice_id DESC
     LIMIT 1`,
  );
  const deliveryCandidate = rowsOf<{
    container_id: number;
    client_id: number;
  }>(dRes);
  if (deliveryCandidate.length > 0) {
    tests.push({
      name: 'delivery_sheet (happy path)',
      report_type: 'delivery_sheet',
      parameters: {
        container_id: deliveryCandidate[0].container_id,
      },
    });
  }

  // Pick a recent client_id for sh_statement smoke.
  const shRes = await db.query(
    `SELECT DISTINCT client_id FROM sh_invoices LIMIT 1`,
  );
  const shClient = rowsOf<{ client_id: number }>(shRes);
  if (shClient.length > 0) {
    tests.push({
      name: 'sh_statement',
      report_type: 'sh_statement',
      parameters: { client_id: shClient[0].client_id },
    });
  }

  // I/O over the last 90 days.
  const today = new Date().toISOString().slice(0, 10);
  const ninetyAgo = new Date(Date.now() - 90 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  tests.push({
    name: 'io_report (last 90 days)',
    report_type: 'io_report',
    parameters: { start_date: ninetyAgo, end_date: today },
  });

  // P&L for the current month.
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
  tests.push({
    name: 'pnl (current month)',
    report_type: 'pnl',
    parameters: { granularity: 'month', period: monthKey },
  });

  for (const t of tests) {
    console.log(`\n── ${t.name} ───────────────────────`);
    try {
      const resolved = await resolveReport(t.report_type, t.parameters, 999);
      console.log(JSON.stringify(resolved.data, null, 2));
    } catch (err) {
      console.error('FAIL:', err instanceof Error ? err.message : err);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
