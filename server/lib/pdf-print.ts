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
/* Each line item (parent row + its modification/delivery sub-rows) is its
   own <tbody>. Keep that group atomic so a line that doesn't fit moves to
   the next page whole, instead of gluing the parent to a sub-row that then
   spills past the content area and prints on top of the page footer. The
   table still breaks freely between groups. */
tbody { page-break-inside: avoid; break-inside: avoid; }
/* The Terms + totals block is a grid; Chromium honors break-inside:avoid on
   tables/table-row-groups but NOT on grid or block containers, so the block
   would fragment onto the footer. Give its wrapper table semantics so the
   avoid is respected and the whole block drops to the next page intact
   instead of overprinting the page number. */
[data-print-keep] {
  display: table;
  width: 100%;
  page-break-inside: avoid;
  break-inside: avoid;
}
`;

// Centered "X / N" page marker that reads as deliberate page furniture
// rather than a number tacked onto the bottom edge: a hairline rule spans
// the content width (inset to match the sheet's 0.85in sides) with the
// counter centered beneath it. Puppeteer header/footer templates render in
// an isolated context with font-size 0 by default, so size/spacing/colors
// are set inline; the bottom page margin reserves the band it sits in.
export const FOOTER_TEMPLATE = `
<div style="width:100%; padding:0 0.85in; font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="border-top:0.75px solid #e2ddd0; padding-top:6px; text-align:center; font-size:8.5px; letter-spacing:0.06em; color:#8a93a5;">
    <span class="pageNumber"></span> / <span class="totalPages"></span>
  </div>
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
// top/bottom breathing room and a page-number footer. The top margin is
// generous so a continuation page's repeated table header doesn't sit
// flush against the paper edge; it's roughly square with the 0.85in side
// inset for a balanced frame. Left/right stay 0 — the sheet owns its
// horizontal inset. Bottom reserves room for the footer rule + counter.
export const PAGINATED_PDF_OPTIONS = {
  format: 'Letter' as const,
  printBackground: true,
  margin: { top: '0.85in', right: 0, bottom: '0.8in', left: 0 },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: FOOTER_TEMPLATE,
};
