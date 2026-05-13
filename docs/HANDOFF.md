# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## You are mid-Phase 3 (PR 3.4 next)

Phase 3 PRs 3.1 (template), 3.2 (Puppeteer PDF pipeline), and 3.3 (tiled `/invoices`) are done. PR 3.3 sits **unmerged** on branch `phase-3-invoices-list`; ask before merging into `2.0`. **Next up is PR 3.4 — `/invoices/:id` read-only detail page (admin-only edit / regen / email / delete) + per-modification line items schema.** Branch off `2.0` as `phase-3-invoice-detail` (or `phase-3-invoices-detail` for consistency with 3.3's slug).

### Do these things before you write any code

1. **Read [PLAN.md](PLAN.md) §5 (UI rework — invoices section) and §7 Phase 3 PR 3.4.**
2. **Read `client/src/components/templates/invoice/InvoiceTemplate.tsx`** — the detail page renders it inline. Tiles in PR 3.3 already do (scaled-down preview); detail page will use it at full size.
3. **Read `server/routes/v2/invoice.js`** for current endpoints + the `INVOICE_SELECT_COLS` shape. The grouped output now includes `sent_at` and `pdf_s3_key` (added in PR 3.3) — used by the status pill and presumably by the "View PDF" button on the detail page.
4. **Per-modification line items spec** — owner confirmed schema change lands in PR 3.4 (see "Decisions worth remembering" below). Probably a new `sold_modifications` table; the InvoiceTemplate already renders N sub-rows per container, so the template doesn't change — just the create-form UI and a backfill of `sold.modification_price` into the new table.

### Open conversations before PR 3.4 work goes deep

- **Tax rate dropdown defaults** — NJ 6.625% + NY 8.875% + "Other (type a rate)" decided 2026-05-13. Wires in during PR 3.4 (invoice create form).
- **Per-modification line items schema** — `sold_modifications`? Columns: `id`, `sold_id` (FK), `description text`, `price numeric(10,2)`, `position smallint`? Confirm at PR 3.4 kickoff. Legacy `sold.modification_price` stays as-is (not backfilled, per "Decisions worth remembering").
- **Detail-page edit affordances** — which fields editable? Customer pickable from clients dropdown? Containers add/remove? Confirm scope at kickoff.
- **PR 3.3 merge-or-iterate decision** — branch is local, awaiting user verification at `http://localhost:3000/invoices`. Owner may want tweaks to tile content (currently mini-preview thumbnail + caption with #, customer, date, total, container count, sent/unsent pill) or sidebar UX (currently left rail with all clients alphabetical + counts) — fall-back options live in [docs/session-notes/](session-notes/) if needed.
- **S&H month-end cron job** — where it runs. Resolve before PR 3.6.
- **Historical re-render of 238 invoices** — opt-in batch script, PR 3.8. The PDF pipeline (PR 3.2) is ready for it.

### Recommended PR breakdown for the rest of Phase 3

1. ~~**PR 3.1** — New invoice template~~ ✅ landed
2. ~~**PR 3.2** — Puppeteer PDF pipeline~~ ✅ landed
3. ~~**PR 3.3** — Tiled `/invoices` list + filter-by-client~~ ✅ branch ready, awaiting user merge
4. **PR 3.4 — `/invoices/:id` detail page.** Read-only by default; admin-only edit / regenerate / email / delete. **Per-modification line items land here** — schema for `sold_modifications` or similar, plus the create-form UI. Template rendering already handles N sub-rows per container.
5. **PR 3.5 — Server-side invoice number sequencing.** `pg_advisory_xact_lock` around the `YYYYMM<seq>` insert.
6. **PR 3.6 — S&H month-end pipeline.** Cron → `sh_invoices` (pending_review) + `sh_invoice_lines`.
7. **PR 3.7 — S&H invoice detail page.** Read-only with Send button. Navbar dropdown surfaces pending S&H invoice counts.
8. **PR 3.8 — Historical re-render.** One-shot script re-PDFs all 238 invoices through the new template, populates `pdf_s3_key`, manual sample verification before commit.

### Don't

- **Don't touch Better Auth tables** (`user`, `session`, `account`, `verification`).
- **Don't run anything against prod.** Local DB only.
- **Don't change snapshot totals on existing invoices.** Re-renders consume the snapshot.
- **Don't bypass lazy migration.** Convert `.jsx` → `.tsx` only when touching a file for real work.
- **Don't `git push` `2.0` to origin without an ask.** Local-only since PR 1.1.
- **Don't backfill per-modification line items on legacy invoices.** Owner ruled it out; legacy stays single-line.

---

## Phase 3 status

| Commit on `2.0` | PR | Contents |
|---|---|---|
| `(merge)` | 3.1 | Invoice template — A wins. Canonical at `client/src/components/templates/invoice/InvoiceTemplate.tsx`. Dev-only preview route at `/admin/invoice-templates`. Format helpers + types in same dir. |
| `(merge)` | 3.2 | Server-side PDF pipeline. Vite library build of `InvoiceTemplate.tsx` → `server/template-dist/`. `server/lib/pdf.ts` SSR-renders + Puppeteer-snapshots. `POST /api/v2/invoice/:id/pdf` (admin-only) renders + uploads to `invoices/<id>.pdf` + updates `pdf_s3_key`. `server/scripts/smoke-pdf.ts` writes a sample PDF to `/tmp/`. Dockerfile.backend now multi-stage with Alpine Chromium. |
| `(unmerged)` | 3.3 | Tiled `/invoices` UI on branch `phase-3-invoices-list`. `client/src/components/lists/InvoicesGrid.tsx` + `.module.css`. Replaces `InvoiceList.jsx` and `routes/Invoices.jsx`; both removed along with orphaned `InvoiceRow.jsx`, `InvoiceDetails.jsx`, `EmailPrompt.jsx`, `SoldList.jsx`, `SoldRow.jsx`, `styles/invoicelist.css`. Layout: left sidebar with alphabetical client list + counts; 240px tiles in `repeat(auto-fill, 240px)` grid; mini-preview thumbnail (full `InvoiceTemplate` scaled 0.294×) + caption (#, customer, date, total, container count, sent/unsent `Badge`); 24-per-page classic pagination; header free-text search across invoice #, customer, container unit_number. Tiles link `/invoices/:id` (404 until PR 3.4 lands). Server change: `groupInvoices` in `routes/v2/invoice.js` now passes through `sent_at` + `pdf_s3_key`; `types.ts` updated to match. |

`2.0` head is the PR 3.2 merge commit. PR 3.3 lives only on the feature branch.

**What's new in the user-facing app (after PRs 3.1 + 3.2):**
- `/admin/invoice-templates` — dev-only preview route. Picks an invoice from the local DB, renders it through the canonical template. "Print preview" button exercises the `@media print` pagination rules.
- `POST /api/v2/invoice/:id/pdf` — admin-only. Server-side renders the template via Puppeteer + uploads to S3.
- No customer-visible change yet — the new template + PDF pipeline don't surface to customers until PR 3.4 (detail page) wires the "Email" button.

**Template design decisions worth remembering:**
- **Winning variant: A.** Modern B2B classic. Slim header (logo left, "INVOICE" right in Archivo Black + Number/Date). FROM/TO addresses with a centered Archivo Black "TO" connector. Deliver-to banner. Items table 8.5pt with line numbers in IBM Plex Mono, sub-rows indented + tight (line-height 1.15, padding 0/0). Summary block has terms paragraph on the left, totals stack on the right. "TOTAL DUE" in Archivo Black uppercase, $ value in IBM Plex Sans 700 tabular.
- **Variants B (data-dense single-pager) and C (hybrid) discarded.** Iteration history in branch commits if needed.
- **Fonts:** Archivo Black (display) + IBM Plex Sans (body + grand-total value) + IBM Plex Mono (line numbers). Loaded via Google Fonts `@import` in the CSS module. Puppeteer will need to await `networkidle0` so fonts load before snapshotting the PDF.
- **Terms wording (owner-confirmed):** "Payment due on receipt. All sales are final. No refunds or exchanges of any kind. All checks are to be certified bank checks payable to **Airtight Storage Systems Inc**."
- **Per-modification line items as a Phase 3 system change** — owner confirmed 2026-05-13. See note in `format.ts:buildLineGroups`. Lands in PR 3.4.
- **Print pagination:** `@page { size: letter; margin: 0 }`, `min-height: 0` under `@media print`, `thead { display: table-header-group }`, `tr { page-break-inside: avoid }`, `.parentRow { page-break-after: avoid }` so a parent never gets orphaned from its first sub.

---

## Status after Phase 2 (historical)

Phase 2 complete on `2.0` (local-only). Eight feature PRs + four follow-ups:

| Commit on `2.0` | PR | Contents |
|---|---|---|
| `1296190` | 2.1 | Intake flow skeleton + Flow primitive |
| `451f8e7` | 2.2 | Sales intake details + submit-as-pending; retire /add |
| `4818517` | 2.3 | S&H domain backend — routes, validation, day-counting |
| `e6cf4c7` | 2.4 | S&H intake branch — client picker + rate prefill + submit |
| `ebbe4e0` | 2.5 | Admin pending-audit screen — both Sales and S&H |
| `e4ba03b` | follow-up | Flow Fragment flattening fix + auto-reset intake on submit |
| `5588e3b` | 2.6 | S3 photo upload + Textract OCR end-to-end |
| `cb1521a` | follow-up | ISO 6346-aware unit-number extraction |
| `fef7858` | 2.7 | Yard view S&H section + navbar pending-audit dropdown |
| `b1d10a0` | 2.8 | Release-number enumeration UX + intake auto-association |
| `d2a0f38` | 2.8.1 | Intake/audit/releases polish |
| `86ca73b` | follow-up | 2.8.1 follow-ups: Button/Modal tokens + release create-with-numbers |

**Local DB state:** unchanged from end of Phase 1 except for migration 0003 (`inventory.photos text[]`). Server vitest passes; client typechecks clean. AWS S3 + Textract verified end-to-end. Bucket `airtight-container-prod-381491901964-us-east-1-an` in `us-east-1`.

---

## Open threads / blockers

None block PR 3.4.

- **Pre-existing global dark-mode bug** — `client/src/styles/inventorylist.css` owns `:root` and `[data-theme=dark]` tokens but is only imported by `InventoryList.jsx`. Fix in Phase 6 polish.
- **40 orphan invoices with no `invoice_containers`** — flagged in PR 1.3 backfill. User to decide before prod cutover.
- **A80 thermal printer** spec — needed before Phase 7.
- **QuickBooks Online vs Desktop** — resolve before Phase 8.
- **Hardware swap** (iPad → rugged Android handheld) — raise inside printer convo.
- **Per-modification line items** — schema + create-flow change in PR 3.4. Template already supports N sub-rows.
- **Server-side-render approach for Puppeteer** (option a/b/c above) — resolve at PR 3.2 kickoff.
- **S&H month-end cron job location** — Phase 3 PR 3.6 prep.
- **Spanish translation source** — Phase 6 prep.
- **Help page content** — author vs draft. Phase 6 prep.
- **Staging environment** — none today. Probably worth standing up before `2.0` → `main` cutover.
- **Vite 8 / vitest 4 bumps** — dev-tooling-only esbuild advisories (GHSA-67mh-4wv8-2f99).
- **`docs/PLAN.md` stash** from PR 1.1 prep may or may not still exist locally.

---

## Decisions worth remembering (since they're not obvious from the code)

- **Site domain split:** customer-facing site = **airtightshippingcontainer.com**. Business mail + invoicing identity stayed at **airtightstorage.com** / "Airtight Storage Systems Inc".
- **In-place rewrite** with single end-of-month cutover when all phases done.
- **`contacts` → `clients`** rename complete, with split address, `business_name`, S&H rate defaults ($65/$65/$1).
- **Storage & Handling is brand new** — separate tables (`sh_inventory`, `sh_invoices`, `sh_invoice_lines`). Boxes don't cross domains.
- **S&H billing** = cron-generated month-end → `pending_review` → admin reviews → Send. Inclusive day counting.
- **Every container has a release_number FK** (NOT NULL).
- **Release-number enumeration:** admin pre-loads container numbers per release; intake auto-flips `is_used=true` on match.
- **Invoice totals snapshot** onto each invoice row. Re-renders consume the snapshot, never re-derive.
- **Invoice numbers:** `YYYYMM` + 3-digit sequence; UNIQUE constraint enforced. Server-side `pg_advisory_xact_lock` around generation lands in PR 3.5.
- **Sale-company normalization map** in `migrate-data-v2.ts`. User-confirmed 2026-05-12.
- **Address splits** for 150 historical clients: CSV-edit workflow. Re-edit at prod cutover.
- **Inventory release-when-empty semantics:** changed from DELETE to `UPDATE is_complete=true` (PR 1.4).
- **Mobile + Spanish are yard-only.** Admin views stay desktop and English.
- **TypeScript everywhere** by end of Phase 5. Lazy migration.
- **PDFs in S3.** Invoices and saved reports. `pdf_s3_key` populated by PR 3.2 (sales) / PR 3.6 (S&H) / PR 5 (reports).
- **Component library** at `client/src/components/ui/` — Button, Modal, Badge, Toast, Flow.
- **OCR field spec:** Textract pulls `unit_number` only; size / damage / acquisition_price typed manually. ISO 6346 check-digit-validated extraction (see `server/lib/textract.ts`).
- **Photo capture spec:** one required photo of the doors + 0-N optional extras.
- **Pre-signed S3 URLs** for PUT (5-min TTL, iPad upload) and GET (1-hour TTL, audit display).
- **`tsx`** is the prod runtime on the server. CSS Modules for new UI primitives; legacy global CSS stays until refactored.
- **Puppeteer-in-Docker:** bundle Chromium into backend image (decided 2026-05-13). `puppeteer` (not `puppeteer-core`).
- **Tax rate dropdown defaults:** NJ 6.625% + NY 8.875% + "Other (type a rate)" (decided 2026-05-13).
- **Invoice template:** canonical at `client/src/components/templates/invoice/InvoiceTemplate.tsx`. Drives both on-screen detail page (PR 3.4) and PDF generation (PR 3.2). Fonts from Google Fonts via `@import` in the CSS module.
- **PDF pipeline gotchas (learned in PR 3.2):**
  - Vite library bundle outputs to **`server/template-dist/`** (not inside `client/`) so its `import "react"` resolves to `server/node_modules/react`. Putting it under `client/` causes two React instances → `$$typeof` Symbol mismatch → `renderToString` throws "Objects are not valid as a React child".
  - In `@media print`, do **not** override `.sheet { min-height: 0 }`. The footer's `margin-top: auto` needs the sheet to be at least one page tall — otherwise short invoices collapse the footer up under the totals.
  - Container numbers (`TCKU287291-3`) contain hyphens that browsers treat as wrap points. `format.ts:protectUnitNumber` swaps them for U+2011 NON-BREAKING HYPHEN. `.colDesc` also has `text-wrap: pretty; hyphens: none`.
  - Puppeteer 24's `page.setContent({ waitUntil })` excludes `'networkidle0'`. To wait for Google Fonts, call `page.evaluate(() => document.fonts.ready)` after setContent.
  - Smoke script ends with `process.exit(0)` because Puppeteer occasionally leaves a Chromium handle alive that blocks Node from exiting cleanly.
- **Phase 4 notes in user's auto-memory** refer to the *Better Auth migration's* Phase 4, NOT the PLAN.md phases.

---

## At end of session

Update this file in place. Note: what you finished, what's in flight, what's blocked, what the next session should pick up. Don't re-add the per-date session-notes pattern — that lives in `docs/session-notes/` as read-only history from the planning phase.
