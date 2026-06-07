// Shared print-pagination helpers for the customer-facing PDFs (invoice
// + quote). Both are one tall `.sheet` div whose padding + min-height
// only apply at the element edges, so without these a page 2 began flush
// against the top of the paper and a short doc was still forced to a full
// 11in. We let the Puppeteer page margins own the top/bottom whitespace
// on EVERY page and neutralize the sheet's own vertical sizing.

// `.sheet` is a hashed CSS-module class, so it's targeted structurally as
// the sole body child. html/body get the cream background so the margin
// bands are paper-colored too, not white. Rows don't split across a page
// break; the table header repeats per page (Chromium default, explicit).
// NB: the sheet is display:flex in screen CSS, but flex children can't
// fragment across printed pages in Chromium — a long table would jump
// wholesale to page 2 instead of splitting. Force block layout for print
// so the table flows naturally. The footer (bottom-pinned via margin-top:
// auto under flex) then just trails the content, which is the correct
// multi-page behavior.
export const PRINT_OVERRIDES = `
html, body { background: #fdfcf8; margin: 0; }
body > div:first-child {
  display: block !important;
  min-height: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
body > div:first-child > footer { margin-top: 0 !important; }
table { page-break-inside: auto; }
tr { page-break-inside: avoid; }
thead { display: table-header-group; }
/* The templates set break-after:avoid on every parent row to keep a line
   attached to its modification/delivery sub-rows. For a line with NO subs
   that chains into "never break after any row", making the whole table
   atomic so it jumps wholesale to page 2. Re-allow a break after subless
   rows (rows with subs still stay glued to their children). */
tr[data-has-subs='false'] {
  break-after: auto !important;
  page-break-after: auto !important;
}
`;

// Small right-aligned "Page X / N" footer. Puppeteer header/footer
// templates render in an isolated context with font-size 0 by default, so
// size/padding are set inline. The horizontal padding matches the sheet's
// 0.85in side inset; the bottom page margin reserves room for it.
export const FOOTER_TEMPLATE = `
<div style="width:100%; font-size:8px; color:#5a6478; font-family: sans-serif; padding:0 0.85in; text-align:right;">
  Page <span class="pageNumber"></span> / <span class="totalPages"></span>
</div>`;

export function wrapPrintHtml(ssrHtml: string, css: string): string {
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

// page.pdf options that give every page (page 1 AND continuation pages)
// top/bottom breathing room and a page-number footer. Left/right stay 0 —
// the sheet owns its 0.85in horizontal inset.
export const PAGINATED_PDF_OPTIONS = {
  format: 'Letter' as const,
  printBackground: true,
  margin: { top: '0.55in', right: 0, bottom: '0.7in', left: 0 },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: FOOTER_TEMPLATE,
};
