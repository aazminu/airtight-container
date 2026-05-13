// PR 3.8: one-shot historical re-render of sales invoices.
//
// Iterates over every row in `invoices`, runs each through the
// Puppeteer pipeline (lib/pdf.ts) and writes the PDF to S3 at
// invoices/<invoice_id>.pdf, then updates pdf_s3_key. Idempotent —
// re-running overwrites.
//
// Usage:
//   tsx server/scripts/rerender-all-invoices.ts                 # all, sequential
//   tsx server/scripts/rerender-all-invoices.ts --limit 5       # first 5 (verification run)
//   tsx server/scripts/rerender-all-invoices.ts --skip-existing # don't re-render rows that already have pdf_s3_key
//   tsx server/scripts/rerender-all-invoices.ts --ids 289,301   # specific invoice_id list
//   tsx server/scripts/rerender-all-invoices.ts --dry-run       # list what would be processed, no PDF work
//
// Sequential by design — Puppeteer holds a single shared browser and
// renders are CPU + bandwidth heavy. Parallelism could speed this up
// but adds complexity for a one-shot.

import "dotenv/config";
import { renderAndStoreInvoicePdf, closeBrowser } from "../lib/pdf.js";
import pool from "../db/pool.js";

interface CliArgs {
  limit: number | null;
  skipExisting: boolean;
  dryRun: boolean;
  ids: number[] | null;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    limit: null,
    skipExisting: false,
    dryRun: false,
    ids: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") {
      out.limit = parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(out.limit) || out.limit <= 0) {
        throw new Error("--limit needs a positive integer");
      }
    } else if (a === "--skip-existing") {
      out.skipExisting = true;
    } else if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a === "--ids") {
      const raw = argv[++i] ?? "";
      out.ids = raw
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
      if (out.ids.length === 0) throw new Error("--ids needs a comma list");
    } else if (a === "--help" || a === "-h") {
      console.log(__doc__());
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${a}`);
    }
  }
  return out;
}

function __doc__(): string {
  return [
    "rerender-all-invoices.ts — re-render every sales invoice PDF through the canonical InvoiceTemplate.",
    "",
    "Flags:",
    "  --limit N         only process the first N (sample-verify before bulk)",
    "  --skip-existing   skip rows that already have pdf_s3_key set",
    "  --ids 289,301     process exactly these invoice ids (comma-separated)",
    "  --dry-run         list what would be processed, no PDF work",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const where: string[] = [];
  const params: unknown[] = [];
  if (args.skipExisting) where.push("pdf_s3_key IS NULL");
  if (args.ids) {
    params.push(args.ids);
    where.push(`invoice_id = ANY($${params.length}::int[])`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limitSql = args.limit ? `LIMIT ${args.limit}` : "";
  const { rows } = await pool.query<{
    invoice_id: number;
    invoice_number: number;
    pdf_s3_key: string | null;
  }>(
    `SELECT invoice_id, invoice_number, pdf_s3_key
     FROM invoices
     ${whereSql}
     ORDER BY invoice_id
     ${limitSql}`,
    params,
  );

  console.log(`[rerender] ${rows.length} invoice${rows.length === 1 ? "" : "s"} to process`);
  if (args.dryRun) {
    for (const r of rows) {
      console.log(
        `  would render id=${r.invoice_id} number=${r.invoice_number}${
          r.pdf_s3_key ? " (already has pdf)" : ""
        }`,
      );
    }
    await pool.end();
    return;
  }

  let ok = 0;
  let fail = 0;
  const start = Date.now();
  for (const r of rows) {
    const t = Date.now();
    try {
      const result = await renderAndStoreInvoicePdf(r.invoice_id);
      await pool.query(
        "UPDATE invoices SET pdf_s3_key = $1 WHERE invoice_id = $2",
        [result.s3Key, r.invoice_id],
      );
      ok += 1;
      console.log(
        `[rerender] id=${r.invoice_id} number=${r.invoice_number} ` +
          `bytes=${result.bytes} ${Date.now() - t}ms`,
      );
    } catch (err) {
      fail += 1;
      console.error(
        `[rerender] FAIL id=${r.invoice_id} number=${r.invoice_number}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[rerender] done: ${ok} succeeded, ${fail} failed, ${elapsed}s total`,
  );

  await closeBrowser();
  await pool.end();
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
