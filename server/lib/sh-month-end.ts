// S&H month-end invoice generator.
//
// Run once per month (cron in server.js, or manually via the admin
// endpoint) for the just-completed month. For each client with
// activity in that month, produce one sh_invoices row (status
// 'pending_review') plus its sh_invoice_lines. Idempotent: a UNIQUE
// (client_id, billing_month) index lets us skip clients that already
// have an invoice for the month.

import type { PoolClient } from 'pg';
// `default` import to play nicely with pool.js's CJS-shape export.
import pool from '../db/pool.js';
import { storageDaysForMonth } from './sh.js';

interface ShInventoryRow {
  id: number;
  client_id: number;
  unit_number: string;
  intake_date: string;
  checkout_date: string | null;
  in_fee: string;
  out_fee: string;
  daily_rate: string;
  state: string;
}

interface InvoiceLineSpec {
  sh_box_id: number;
  line_type: 'in_fee' | 'out_fee' | 'storage_days';
  days_count: number | null;
  rate: string;
  amount: string;
  description: string;
}

export interface MonthEndSummary {
  year: number;
  monthIndex: number;
  invoicesCreated: number;
  invoicesSkipped: number;
  errors: Array<{ clientId: number; message: string }>;
}

const SH_INVOICE_SEQ_LOCK_KEY = '5054_4853_4551_4e23'; // 'STSHSEQ#' as decimal-ish hex
const lockKeyDecimal = BigInt('0x' + SH_INVOICE_SEQ_LOCK_KEY.replace(/_/g, '')).toString();

const billingMonthDate = (year: number, monthIndex: number): string => {
  const m = String(monthIndex + 1).padStart(2, '0');
  return `${year}-${m}-01`;
};

const monthPrefix = (year: number, monthIndex: number): number => {
  const m = String(monthIndex + 1).padStart(2, '0');
  return parseInt(`${year}${m}`, 10);
};

const nextShInvoiceNumber = async (
  client: PoolClient,
  prefix: number,
): Promise<number> => {
  await client.query('SELECT pg_advisory_xact_lock($1)', [lockKeyDecimal]);
  const min = prefix * 1000 + 1;
  const max = prefix * 1000 + 999;
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(invoice_number), $1::int - 1) + 1 AS next
     FROM sh_invoices
     WHERE invoice_number BETWEEN $1 AND $2`,
    [min, max],
  );
  const n = rows[0].next as number;
  if (n > max) {
    throw new Error(`S&H invoice sequence exhausted for ${prefix} (>= 999)`);
  }
  return n;
};

const buildLinesForBox = (
  box: ShInventoryRow,
  year: number,
  monthIndex: number,
): InvoiceLineSpec[] => {
  const intake = new Date(box.intake_date);
  const checkout = box.checkout_date ? new Date(box.checkout_date) : null;
  const lines: InvoiceLineSpec[] = [];
  const inThisMonth =
    intake.getFullYear() === year && intake.getMonth() === monthIndex;
  if (inThisMonth) {
    lines.push({
      sh_box_id: box.id,
      line_type: 'in_fee',
      days_count: null,
      rate: box.in_fee,
      amount: box.in_fee,
      description: `Intake fee · ${box.unit_number}`,
    });
  }
  const outThisMonth =
    checkout != null &&
    checkout.getFullYear() === year &&
    checkout.getMonth() === monthIndex;
  if (outThisMonth) {
    lines.push({
      sh_box_id: box.id,
      line_type: 'out_fee',
      days_count: null,
      rate: box.out_fee,
      amount: box.out_fee,
      description: `Check-out fee · ${box.unit_number}`,
    });
  }
  const days = storageDaysForMonth(intake, checkout, year, monthIndex);
  if (days > 0) {
    const rate = Number(box.daily_rate);
    const amount = (rate * days).toFixed(2);
    lines.push({
      sh_box_id: box.id,
      line_type: 'storage_days',
      days_count: days,
      rate: box.daily_rate,
      amount,
      description: `Storage · ${box.unit_number} · ${days} day${days === 1 ? '' : 's'}`,
    });
  }
  return lines;
};

/**
 * Generate S&H invoices for one billing month. Inserts a single row
 * into `sh_invoices` per client with activity (intake / checkout /
 * storage days in that month) plus all its `sh_invoice_lines`, in a
 * single transaction per client. Existing invoices for the same
 * (client_id, billing_month) are skipped (idempotent).
 *
 * @param year         e.g. 2026
 * @param monthIndex   0-11 (so April = 3)
 */
export async function generateShMonthEnd(
  year: number,
  monthIndex: number,
): Promise<MonthEndSummary> {
  const billingMonth = billingMonthDate(year, monthIndex);
  const monthEnd = new Date(year, monthIndex + 1, 0);
  const summary: MonthEndSummary = {
    year,
    monthIndex,
    invoicesCreated: 0,
    invoicesSkipped: 0,
    errors: [],
  };

  // Boxes that overlapped this month: arrived on/before month end AND
  // (still in storage OR checked out on/after the month started).
  const monthStart = new Date(year, monthIndex, 1);
  const client = await pool.connect();
  try {
    const { rows: boxes } = await client.query<ShInventoryRow>(
      `SELECT id, client_id, unit_number, intake_date, checkout_date,
              in_fee, out_fee, daily_rate, state
       FROM sh_inventory
       WHERE intake_date <= $2
         AND (checkout_date IS NULL OR checkout_date >= $1)
         AND state IN ('in_storage', 'checked_out')
       ORDER BY client_id, intake_date`,
      [monthStart, monthEnd],
    );

    const byClient = new Map<number, ShInventoryRow[]>();
    for (const b of boxes) {
      if (!byClient.has(b.client_id)) byClient.set(b.client_id, []);
      byClient.get(b.client_id)!.push(b);
    }

    for (const [clientId, clientBoxes] of byClient) {
      try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query(
          'SELECT id FROM sh_invoices WHERE client_id = $1 AND billing_month = $2',
          [clientId, billingMonth],
        );
        if (existing.length > 0) {
          await client.query('ROLLBACK');
          summary.invoicesSkipped += 1;
          continue;
        }

        const allLines = clientBoxes.flatMap((b) =>
          buildLinesForBox(b, year, monthIndex),
        );
        if (allLines.length === 0) {
          await client.query('ROLLBACK');
          continue;
        }

        const subtotal = allLines.reduce((s, l) => s + Number(l.amount), 0);
        const invoiceNumber = await nextShInvoiceNumber(
          client,
          monthPrefix(year, monthIndex),
        );

        const { rows: insertedInv } = await client.query(
          `INSERT INTO sh_invoices
             (client_id, billing_month, invoice_number, subtotal, total,
              status, generated_at)
           VALUES ($1, $2, $3, $4, $4, 'pending_review', NOW())
           RETURNING id`,
          [clientId, billingMonth, invoiceNumber, subtotal.toFixed(2)],
        );
        const shInvoiceId = insertedInv[0].id;

        for (const line of allLines) {
          await client.query(
            `INSERT INTO sh_invoice_lines
               (sh_invoice_id, sh_box_id, line_type, days_count, rate,
                amount, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              shInvoiceId,
              line.sh_box_id,
              line.line_type,
              line.days_count,
              line.rate,
              line.amount,
              line.description,
            ],
          );
        }

        await client.query('COMMIT');
        summary.invoicesCreated += 1;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        summary.errors.push({
          clientId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    client.release();
  }
  return summary;
}

// Returns {year, monthIndex} of the month JUST BEFORE `now`. Cron
// fires on the 1st of a month to bill the month that ended.
export function priorMonth(now: Date = new Date()): {
  year: number;
  monthIndex: number;
} {
  const prior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: prior.getFullYear(), monthIndex: prior.getMonth() };
}
