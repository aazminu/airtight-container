// Server-side quote PDF rendering. Parallel to lib/pdf.ts (invoice) but
// kept fully separate so the invoice render path stays untouched: it
// loads its own QuoteTemplate bundle, fetches quote data, and stores to
// quotes/<id>.pdf in S3.
//
// Builds depend on `npm run build:quote-template` (in client/) having
// produced quote-template-dist/{QuoteTemplate.js,QuoteTemplate.css}.
//
// The headless Chromium is shared with the invoice/report render paths
// via lib/puppeteer.ts.

import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import db from '../db/index.js';
import { putObject, getObjectBytes } from './s3.js';
import { withPage, closeBrowser } from './puppeteer.js';
import { wrapPrintHtml, PAGINATED_PDF_OPTIONS } from './pdf-print.js';

// Kept under the old name in case a caller imports it; the browser now
// lives in lib/puppeteer.ts.
export const closeQuoteBrowser = closeBrowser;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUNDLE_DIR =
  process.env.QUOTE_TEMPLATE_DIR ??
  path.join(__dirname, '../quote-template-dist');
const BUNDLE_JS = path.join(BUNDLE_DIR, 'QuoteTemplate.js');
const BUNDLE_CSS = path.join(BUNDLE_DIR, 'QuoteTemplate.css');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _template: any = null;
let _css: string | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTemplate(): Promise<any> {
  if (_template) return _template;
  const mod = await import(BUNDLE_JS);
  _template = mod.default;
  return _template;
}

async function getCss(): Promise<string> {
  if (_css !== null) return _css;
  _css = await readFile(BUNDLE_CSS, 'utf8');
  return _css;
}

interface QuoteData {
  id: number;
  quote_number: string;
  quote_taxed: boolean;
  quote_credit: boolean;
  created_at: string;
  notes: string | null;
  subtotal: string | null;
  tax_rate: string | null;
  tax_amount: string | null;
  cc_fee_rate: string | null;
  cc_fee_amount: string | null;
  total: string | null;
  customer: {
    id: number;
    client_name: string;
    business_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  lines: Array<{
    id: number;
    description: string;
    sale_price: string | null;
    trucking_rate: string | null;
    destination: string | null;
    position: number;
    modifications: Array<{
      id: number;
      description: string;
      price: string;
      position: number;
    }>;
  }>;
}

export async function fetchQuoteData(quoteId: number): Promise<QuoteData | null> {
  const { rows } = await db.query(
    `SELECT q.id, q.quote_number, q.quote_taxed, q.quote_credit, q.created_at,
            q.notes, q.subtotal, q.tax_rate, q.tax_amount, q.cc_fee_rate,
            q.cc_fee_amount, q.total, q.client_id,
            cl.client_name, cl.business_name, cl.contact_email, cl.contact_phone,
            cl.street, cl.city, cl.state AS client_state, cl.zip
       FROM quotes q
       JOIN clients cl ON q.client_id = cl.id
      WHERE q.id = $1`,
    [quoteId],
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = rows[0] as any;
  if (!q) return null;

  const { rows: lineRows } = await db.query(
    `SELECT id, description, sale_price, trucking_rate, destination, position
       FROM quote_line_items
      WHERE quote_id = $1
      ORDER BY position, id`,
    [quoteId],
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = lineRows as any[];
  const lineIds = lines.map((l) => l.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modsByLine = new Map<number, any[]>();
  if (lineIds.length > 0) {
    const { rows: modRows } = await db.query(
      `SELECT id, quote_line_item_id, description, price, position
         FROM quote_line_modifications
        WHERE quote_line_item_id = ANY($1::int[])
        ORDER BY quote_line_item_id, position, id`,
      [lineIds],
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of modRows as any[]) {
      if (!modsByLine.has(m.quote_line_item_id))
        modsByLine.set(m.quote_line_item_id, []);
      modsByLine.get(m.quote_line_item_id)!.push(m);
    }
  }

  return {
    id: q.id,
    quote_number: q.quote_number,
    quote_taxed: q.quote_taxed,
    quote_credit: q.quote_credit,
    created_at: q.created_at,
    notes: q.notes,
    subtotal: q.subtotal,
    tax_rate: q.tax_rate,
    tax_amount: q.tax_amount,
    cc_fee_rate: q.cc_fee_rate,
    cc_fee_amount: q.cc_fee_amount,
    total: q.total,
    customer: {
      id: q.client_id,
      client_name: q.client_name,
      business_name: q.business_name,
      contact_email: q.contact_email,
      contact_phone: q.contact_phone,
      street: q.street,
      city: q.city,
      state: q.client_state,
      zip: q.zip,
    },
    lines: lines.map((l) => ({
      id: l.id,
      description: l.description,
      sale_price: l.sale_price,
      trucking_rate: l.trucking_rate,
      destination: l.destination,
      position: l.position,
      modifications: modsByLine.get(l.id) ?? [],
    })),
  };
}

export async function renderQuotePdf(quoteId: number): Promise<Buffer> {
  const data = await fetchQuoteData(quoteId);
  if (!data) throw new Error(`Quote ${quoteId} not found`);
  const Template = await getTemplate();
  const css = await getCss();
  const ssrHtml = renderToString(createElement(Template, { data }));
  const html = wrapPrintHtml(ssrHtml, css);
  return withPage(async (page) => {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf(PAGINATED_PDF_OPTIONS);
    return Buffer.from(pdf);
  });
}

export function quotePdfS3Key(quoteId: number): string {
  return `quotes/${quoteId}.pdf`;
}

export async function renderAndStoreQuotePdf(
  quoteId: number,
): Promise<{ s3Key: string; bytes: number }> {
  const buf = await renderQuotePdf(quoteId);
  const key = quotePdfS3Key(quoteId);
  await putObject(key, buf, 'application/pdf');
  return { s3Key: key, bytes: buf.length };
}

export async function getQuotePdfBytes(s3Key: string): Promise<Buffer> {
  return getObjectBytes(s3Key);
}
