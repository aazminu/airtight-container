// Server-side invoice PDF rendering.
//
// Pipeline:
//   1. Load invoice data from PG (same shape as /api/v2/invoice/:id).
//   2. SSR the canonical InvoiceTemplate React component (from the
//      Vite library build at client/dist-server/) with react-dom/server.
//   3. Wrap the SSR output in a full HTML document with the compiled
//      CSS inlined into a <style> tag (so Puppeteer doesn't need to
//      resolve module-relative asset paths).
//   4. page.setContent + page.pdf via a long-lived headless Chromium.
//   5. PUT to S3 at invoices/<invoice_id>.pdf.
//
// Builds depend on `npm run build:server-template` (in client/) having
// produced dist-server/{InvoiceTemplate.js,InvoiceTemplate.css}. In the
// Docker image, this lands via a multi-stage build copying the artifact
// from a client-build stage into the backend image.
//
// The headless Chromium is shared across all PDF render paths via
// lib/puppeteer.ts (see that file for the recycle/lifecycle rationale).

import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import db from '../db/index.js';
import { putObject, getObjectBytes } from './s3.js';
import { withPage, closeBrowser } from './puppeteer.js';

// Re-exported so existing scripts (smoke-pdf, rerender-all-invoices) that
// import closeBrowser from this module keep working after the browser
// moved into lib/puppeteer.ts.
export { closeBrowser };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The bundle lives inside server/ (not client/dist-server) so that the
// bundle's `import "react"` resolves to server/node_modules/react —
// otherwise we end up with two React instances and renderToString
// throws "Objects are not valid as a React child" on the foreign-realm
// $$typeof Symbol.
const BUNDLE_DIR =
  process.env.INVOICE_TEMPLATE_DIR ??
  path.join(__dirname, '../template-dist');
const BUNDLE_JS = path.join(BUNDLE_DIR, 'InvoiceTemplate.js');
const BUNDLE_CSS = path.join(BUNDLE_DIR, 'InvoiceTemplate.css');

// ---- shared lazy singletons -----------------------------------------

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

// ---- data fetch -----------------------------------------------------

// Mirrors the SELECT + groupInvoices() in server/routes/v2/invoice.js,
// kept in TS here so the PDF path doesn't depend on the legacy JS route.
const INVOICE_SELECT = `
  i.invoice_id, i.invoice_number, i.invoice_taxed, i.invoice_credit, i.invoice_date,
  i.subtotal, i.tax_rate, i.tax_amount, i.cc_fee_rate, i.cc_fee_amount, i.total,
  i.pdf_s3_key, i.sent_at, i.client_id,
  cl.client_name, cl.business_name, cl.contact_email, cl.contact_phone,
  cl.street, cl.city, cl.state AS client_state, cl.zip,
  ct.id AS container_id, ct.unit_number, ct.size, ct.damage, ct.state AS inventory_state,
  sc.id AS sold_id, sc.outbound_date, sc.destination, sc.trucking_rate, sc.sale_price,
  sc.modification_price, sc.invoice_notes
`;

interface InvoiceData {
  invoice_id: number;
  invoice_number: number;
  invoice_taxed: boolean;
  invoice_credit: boolean;
  invoice_date: string;
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
  containers: Array<{
    inventory_id: number;
    sold_id: number | null;
    unit_number: string;
    state: string;
    size: string;
    damage: string;
    destination: string | null;
    trucking_rate: string | null;
    sale_price: string | null;
    modification_price: string | null;
    outbound_date: string | null;
    invoice_notes: string | null;
    modifications: InvoiceModification[];
  }>;
}

interface InvoiceModification {
  id: number;
  sold_id: number;
  description: string;
  price: string;
  position: number;
}

async function fetchInvoiceData(invoiceId: number): Promise<InvoiceData | null> {
  const result = await db.query(
    `SELECT ${INVOICE_SELECT}
     FROM invoices i
     JOIN clients cl ON i.client_id = cl.id
     JOIN invoice_containers ci ON i.invoice_id = ci.invoice_id
     JOIN inventory ct ON ci.container_id = ct.id
     LEFT JOIN sold sc ON ct.id = sc.inventory_id
     WHERE i.invoice_id = $1
     ORDER BY ci.container_id`,
    [invoiceId],
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = result.rows as any[];
  if (rows.length === 0) return null;
  const first = rows[0];
  const data: InvoiceData = {
    invoice_id: first.invoice_id,
    invoice_number: first.invoice_number,
    invoice_taxed: first.invoice_taxed,
    invoice_credit: first.invoice_credit,
    invoice_date: first.invoice_date,
    subtotal: first.subtotal,
    tax_rate: first.tax_rate,
    tax_amount: first.tax_amount,
    cc_fee_rate: first.cc_fee_rate,
    cc_fee_amount: first.cc_fee_amount,
    total: first.total,
    customer: {
      id: first.client_id,
      client_name: first.client_name,
      business_name: first.business_name,
      contact_email: first.contact_email,
      contact_phone: first.contact_phone,
      street: first.street,
      city: first.city,
      state: first.client_state,
      zip: first.zip,
    },
    containers: rows.map((r) => ({
      inventory_id: r.container_id,
      sold_id: r.sold_id,
      unit_number: r.unit_number,
      state: r.inventory_state,
      size: r.size,
      damage: r.damage,
      destination: r.destination,
      trucking_rate: r.trucking_rate,
      sale_price: r.sale_price,
      modification_price: r.modification_price,
      outbound_date: r.outbound_date,
      invoice_notes: r.invoice_notes,
      modifications: [],
    })),
  };
  // Attach per-modification line items in one IN-list query (not N+1),
  // mirroring attachModifications() in routes/v2/invoice.js. The template
  // renders these as sub-rows; without them the PDF falls back to the
  // legacy sold.modification_price scalar and shows no per-mod breakdown.
  const soldIds = data.containers
    .map((c) => c.sold_id)
    .filter((id): id is number => id != null);
  if (soldIds.length > 0) {
    const modResult = await db.query(
      `SELECT id, sold_id, description, price, position
       FROM sold_modifications
       WHERE sold_id = ANY($1::int[])
       ORDER BY sold_id, position, id`,
      [soldIds],
    );
    const bySold = new Map<number, InvoiceModification[]>();
    const modRows = modResult.rows as unknown as InvoiceModification[];
    for (const m of modRows) {
      if (!bySold.has(m.sold_id)) bySold.set(m.sold_id, []);
      bySold.get(m.sold_id)!.push(m);
    }
    for (const c of data.containers) {
      c.modifications = c.sold_id != null ? bySold.get(c.sold_id) ?? [] : [];
    }
  }
  return data;
}

// ---- HTML wrapper ---------------------------------------------------

// Print overrides for multi-page invoices. The template is one tall
// `.sheet` div whose padding + min-height:11in only apply at the element
// edges — so before this, page 2+ began flush against the top of the
// paper and a short invoice was still forced to a full 11in. We let the
// Puppeteer page margins (set in page.pdf) own the top/bottom whitespace
// on EVERY page and neutralize the sheet's own vertical sizing. `.sheet`
// is a hashed CSS-module class, so we target it structurally as the sole
// body child. html/body get the cream background so the Puppeteer margin
// bands are paper-colored too, not white. Rows don't split across a page
// break; the table header repeats per page (Chromium default, explicit).
const PRINT_OVERRIDES = `
html, body { background: #fdfcf8; margin: 0; }
body > div:first-child {
  min-height: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
table { page-break-inside: auto; }
tr { page-break-inside: avoid; }
thead { display: table-header-group; }
`;

function wrapHtml(ssrHtml: string, css: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>${css}</style>
<style>${PRINT_OVERRIDES}</style>
</head>
<body>${ssrHtml}</body>
</html>`;
}

// Small right-aligned "Page X / N" footer. Puppeteer header/footer
// templates render in an isolated context with font-size 0 by default, so
// size/padding are set inline. The horizontal padding matches the sheet's
// 0.85in side inset; the bottom page margin reserves room for it.
const FOOTER_TEMPLATE = `
<div style="width:100%; font-size:8px; color:#5a6478; font-family: sans-serif; padding:0 0.85in; text-align:right;">
  Page <span class="pageNumber"></span> / <span class="totalPages"></span>
</div>`;

// ---- public API -----------------------------------------------------

export async function renderInvoicePdf(invoiceId: number): Promise<Buffer> {
  const log = (msg: string) =>
    process.env.PDF_DEBUG && console.error(`[pdf] ${msg}`);
  log(`fetch invoice ${invoiceId}`);
  const data = await fetchInvoiceData(invoiceId);
  if (!data) throw new Error(`Invoice ${invoiceId} not found`);
  log('load template bundle');
  const Template = await getTemplate();
  log('load css');
  const css = await getCss();
  log('render-to-string');
  const ssrHtml = renderToString(createElement(Template, { data }));
  const html = wrapHtml(ssrHtml, css);
  log(`html=${html.length} bytes, acquiring page`);
  return withPage(async (page) => {
    log('setContent');
    // setContent's waitUntil excludes networkidle in Puppeteer 24.
    // Wait on the FontFaceSet promise instead so the rendered PDF uses
    // Archivo Black / IBM Plex etc., not the fallback system fonts.
    await page.setContent(html, { waitUntil: 'load' });
    log('await fonts.ready');
    await page.evaluate(() => document.fonts.ready);
    log('page.pdf');
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      // Top/bottom margins give every page (page 1 AND continuation
      // pages) breathing room instead of starting flush at the edge.
      // Left/right stay 0 — the sheet owns its 0.85in horizontal inset.
      margin: { top: '0.55in', right: 0, bottom: '0.7in', left: 0 },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: FOOTER_TEMPLATE,
    });
    log(`pdf=${pdf.length} bytes`);
    return Buffer.from(pdf);
  });
}

export function invoicePdfS3Key(invoiceId: number): string {
  return `invoices/${invoiceId}.pdf`;
}

export async function renderAndStoreInvoicePdf(
  invoiceId: number,
): Promise<{ s3Key: string; bytes: number }> {
  const buf = await renderInvoicePdf(invoiceId);
  const key = invoicePdfS3Key(invoiceId);
  await putObject(key, buf, 'application/pdf');
  return { s3Key: key, bytes: buf.length };
}

export async function getInvoicePdfBytes(s3Key: string): Promise<Buffer> {
  return getObjectBytes(s3Key);
}
