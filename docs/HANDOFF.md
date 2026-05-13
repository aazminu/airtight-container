# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## You are mid-Phase 3 (PR 3.2 next)

Phase 3 PR 3.1 (new invoice template) is landed on `2.0` via `--no-ff` merge of `phase-3-invoice-template`. **Next up is PR 3.2 — server-side Puppeteer PDF pipeline + S3 upload.** Branch off `2.0` as `phase-3-puppeteer` (dashed convention, since `phase-3` would namespace-collide with `phase-3-invoice-template`).

### Do these things before you write any code

1. **Read [PLAN.md](PLAN.md) §3 (snapshot totals on invoices), §4.5 (invoice template + PDF model), §6 (security pass — output escaping on invoice HTML), and §7 Phase 3 (PR 3.2 scope + exit criteria).**
2. **Read the canonical template** at `client/src/components/templates/invoice/InvoiceTemplate.tsx` + `InvoiceTemplate.module.css`. This is the same React component PR 3.2 will render server-side via Puppeteer to produce the PDF.
3. **Read the data-shape helper** at `client/src/components/templates/invoice/format.ts` — `buildLineGroups` is the function that turns API response → renderable line groups (parent + N subs). Puppeteer needs the same `/api/v2/invoice/:id` payload the on-screen detail page will use.
4. **Skim [AWS_SETUP.md](AWS_SETUP.md) §1** — `invoices/<invoice_id>.pdf` is the agreed-upon S3 key layout. No new bucket setup; same IAM user from PR 2.6. Same env vars (`AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) already on local + EC2.
5. **Browser-test the template you're about to render server-side:** sign in, hit `/admin/invoice-templates` (dev-only route mounted under `import.meta.env.DEV`). Pick a long invoice from the dropdown (default is `#202604009` — 2 containers + 2 mods + 2 deliveries + tax + CC). Click "Print preview" to verify the print-CSS pagination still behaves; that's what Puppeteer will consume.

### Open conversations before PR 3.2 work goes deep

- **Puppeteer-in-Docker plumbing.** Decided 2026-05-13: bundle Chromium into the backend image. Means `puppeteer` (not `puppeteer-core`), let it install its own bundled Chromium during the Docker build, and the backend image grows ~250 MB. Acceptable at our scale.
- **PR 3.2 architecture sketch:** new module `server/lib/pdf.ts` boots a long-lived Puppeteer browser instance, exposes `renderInvoicePdf(invoiceId): Promise<Buffer>`. The browser loads `http://localhost:3001/api/v2/invoice/<id>/render` (a new dev-only HTML endpoint that returns a server-side-rendered version of `InvoiceTemplate` against the live invoice data), waits for fonts + images, calls `page.pdf({ format: 'Letter', margin: 0, printBackground: true })`. Then upload to S3 at `invoices/<invoice_id>.pdf` via the existing `server/lib/s3.ts` helpers and update `invoices.pdf_s3_key`. A new admin-only POST route triggers the render for a single invoice; PR 3.8 wraps this in a loop for the 238-invoice historical re-render.
- **Server-side-render vs. fetch-from-Vite.** Three options for how Puppeteer sees the template: (a) Puppeteer loads a dev-only Vite-served URL (only works in dev); (b) we ship a separate Puppeteer-targeted HTML bundle via vite-ssr or similar; (c) we render the React tree to HTML on the server with `react-dom/server` + read the compiled CSS module file from `client/dist/assets/`. Option (c) is the only one that works in prod without a running Vite dev server. Resolve at start of PR 3.2.
- **Tax rate dropdown defaults** — NJ 6.625% + NY 8.875% + "Other (type a rate)" decided 2026-05-13. Wires in during PR 3.4 (invoice create form), not PR 3.2.
- **S&H month-end cron job** — where it runs. Still open. Resolve before PR 3.6.
- **Historical re-render of 238 invoices** — opt-in batch script, lands in PR 3.8.

### Recommended PR breakdown for the rest of Phase 3

1. ~~**PR 3.1** — New invoice template~~ ✅ landed
2. **PR 3.2 — Puppeteer PDF pipeline.** Server renders `InvoiceTemplate` → PDF → S3. `pdf_s3_key` populated on save. Backwards-compatible regen command for historicals.
3. **PR 3.3 — Tiled `/invoices` list + filter-by-client.** Replaces legacy `InvoiceList.jsx`. Search moved into table header per PLAN §5.
4. **PR 3.4 — `/invoices/:id` detail page.** Read-only by default; admin-only edit / regenerate / email / delete. **Per-modification line items land here** — schema for `sold_modifications` or similar, plus the create-form UI to add multiple mod entries per container. Template rendering already handles N sub-rows per container.
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

`2.0` head is the PR 3.1 merge commit.

**What's new in the user-facing app (PR 3.1):**
- `/admin/invoice-templates` — dev-only preview route (mounted under `import.meta.env.DEV`). Picks an invoice from the local DB, renders it through the canonical template. Has a "Print preview" button that exercises the `@media print` pagination rules.
- No production user-facing change yet — the new template doesn't render in any production-visible flow until PR 3.3 (tiled `/invoices` list) and PR 3.4 (detail page).

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

None block PR 3.2.

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
- **Phase 4 notes in user's auto-memory** refer to the *Better Auth migration's* Phase 4, NOT the PLAN.md phases.

---

## At end of session

Update this file in place. Note: what you finished, what's in flight, what's blocked, what the next session should pick up. Don't re-add the per-date session-notes pattern — that lives in `docs/session-notes/` as read-only history from the planning phase.
