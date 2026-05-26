// Server-side report PDF rendering.
//
// Pipeline (parallel to lib/pdf.ts which still handles invoices):
//   1. Load the resolved_data blob from reports.id (server already
//      snapshotted the data at create time — see report-resolvers/).
//   2. SSR the unified ReportTemplate React dispatcher (built from
//      client/src/components/templates/report-templates.tsx) with
//      { type: report_type, data: resolved_data }.
//   3. Wrap in an HTML document with the compiled CSS inlined.
//   4. page.setContent + page.pdf via a shared headless Chromium.
//   5. PUT to S3 at reports/<report_id>.pdf.
//
// Builds depend on `npm run build:report-templates` (in client/)
// producing server/report-template-dist/{ReportTemplate.js,.css}.

import puppeteer, { type Browser } from 'puppeteer';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { putObject, getObjectBytes } from './s3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUNDLE_DIR =
  process.env.REPORT_TEMPLATE_DIR ??
  path.join(__dirname, '../report-template-dist');
const BUNDLE_JS = path.join(BUNDLE_DIR, 'ReportTemplate.js');
const BUNDLE_CSS = path.join(BUNDLE_DIR, 'ReportTemplate.css');

let _browser: Browser | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _template: any = null;
let _css: string | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser) return _browser;
  _browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
  return _browser;
}

export async function closeReportBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

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

function wrapHtml(ssrHtml: string, css: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>${css}</style>
</head>
<body>${ssrHtml}</body>
</html>`;
}

export type ReportType =
  | 'delivery_sheet'
  | 'io_report'
  | 'pnl'
  | 'sh_statement'
  | 'release_summary';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function renderReportPdf(
  reportType: ReportType,
  data: unknown,
): Promise<Buffer> {
  const log = (msg: string) =>
    process.env.PDF_DEBUG && console.error(`[report-pdf] ${msg}`);
  log(`render ${reportType}`);
  const Template = await getTemplate();
  const css = await getCss();
  const ssrHtml = renderToString(
    createElement(Template, { type: reportType, data }),
  );
  const html = wrapHtml(ssrHtml, css);
  log(`html=${html.length} bytes, launching browser`);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    log(`pdf=${pdf.length} bytes`);
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export function reportPdfS3Key(reportId: number): string {
  return `reports/${reportId}.pdf`;
}

export async function renderAndStoreReportPdf(
  reportId: number,
  reportType: ReportType,
  data: unknown,
): Promise<{ s3Key: string; bytes: number }> {
  const buf = await renderReportPdf(reportType, data);
  const key = reportPdfS3Key(reportId);
  await putObject(key, buf, 'application/pdf');
  return { s3Key: key, bytes: buf.length };
}

export async function getReportPdfBytes(s3Key: string): Promise<Buffer> {
  return getObjectBytes(s3Key);
}
