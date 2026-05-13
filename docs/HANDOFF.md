# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## Phase 3 complete — Phase 4 next

All eight Phase 3 PRs (3.1–3.8) are merged into `2.0` locally. **Next up is Phase 4 — Inventory + Yard refresh.** Pick the kickoff conversation from [PLAN.md §7 Phase 4](PLAN.md#phase-4--inventory--yard-refresh).

### Do these things before you write any code

1. **Read [PLAN.md](PLAN.md) §5 (UI rework — Inventory section) and §7 Phase 4.**
2. **Read `client/src/components/lists/InventoryList.jsx`** — pagination bug at line 53 (`+= 1`) is the canonical reference for the "broken pagination" mentioned in PLAN. This component is what Phase 4 replaces.
3. **Skim `client/src/components/lists/InvoicesGrid.tsx`** (PR 3.3) and `client/src/routes/InvoiceDetail.tsx` (PR 3.4) — Phase 4 follows the same shape (tiled/table list + popup edit modal vertical) so the patterns there are a good cookbook.

### Open conversations before Phase 4 work goes deep

- **Three state-segmented inventory tables** — `available` / `sold` / `outbound`? Or `available` / `pending` / `sold`? Confirm at kickoff.
- **Popup edit modal vertical layout** — which fields, validation rules?
- **Search-in-header pattern** — mirror invoices grid (header free-text + sidebar by sale_company maybe) or pure table?
- **"Mark Outbound" button removal** — confirm the outbound flow that replaces it (probably part of the invoice send/email path? Or a yard checkout action?).
- **Yard view facelift scope** — same data, just polish, or new groupings?

### Two follow-up items that didn't fit cleanly into Phase 3

- **S&H invoice email send** — the PR 3.7 detail page Send button currently just flips `status -> sent` and stamps `sent_at`. It doesn't actually email the customer. Mirror the sales-invoice `POST /api/v2/invoice/:id/email` Resend-with-PDF-attachment path when the user is ready (probably wrap into Phase 5 or as a standalone PR 3.9). Needs an S&H invoice PDF template first — currently the detail page renders an HTML sheet, not a Puppeteer-PDF artifact.
- **Historical re-render bulk run** — `server/scripts/rerender-all-invoices.ts` is written and dry-runnable. Recommended cutover dance per the PR 3.8 commit: `--dry-run`, then `--limit 5` + manual S3 sample review, then full run. Has not been bulk-executed against the local DB or prod yet.

### Don't

- **Don't touch Better Auth tables** (`user`, `session`, `account`, `verification`).
- **Don't run anything against prod.** Local DB only.
- **Don't change snapshot totals on existing invoices.** Re-renders consume the snapshot.
- **Don't bypass lazy migration.** Convert `.jsx` → `.tsx` only when touching a file for real work.
- **Don't `git push` `2.0` to origin without an ask.** Local-only since PR 1.1.
- **Don't backfill per-modification line items on legacy invoices.** Owner ruled it out; legacy stays single-line.

---

## Phase 3 status

| PR | Contents |
|---|---|
| 3.1 | Invoice template — A wins. Canonical at `client/src/components/templates/invoice/InvoiceTemplate.tsx`. Dev-only preview route at `/admin/invoice-templates`. |
| 3.2 | Server-side PDF pipeline. `server/lib/pdf.ts` SSR + Puppeteer. `POST /api/v2/invoice/:id/pdf` renders + uploads to S3 + sets `pdf_s3_key`. Dockerfile.backend multi-stage w/ Alpine Chromium. |
| 3.3 | Tiled `/invoices` UI in `client/src/components/lists/InvoicesGrid.tsx`. Decorative invoice-header strip + caption (#, customer, date, total, sent/unsent, container count); 240px tiles `repeat(auto-fill, 240px)`; sidebar sorted by invoice count (top 20 + "Show all (N)" expand); search narrows tiles AND sidebar with active-client snap-back; 24-per-page pagination. `routes/Invoices.tsx` replaces `Invoices.jsx`. Legacy `InvoiceList.jsx`, `InvoiceRow.jsx`, `InvoiceDetails.jsx`, `EmailPrompt.jsx`, `SoldList.jsx`, `SoldRow.jsx`, `invoicelist.css` deleted. |
| 3.4 | `/invoices/:id` route + `routes/InvoiceDetail.tsx`. Read-only InvoiceTemplate full-size + admin Edit/Regenerate PDF/Email/Delete actions. New `components/forms/InvoiceEditor.tsx` for full edit mode (customer picker, date, tax preset, CC fee, per-container fields, container add/remove, per-modification line items with reorder, live totals preview). Server: `sold_modifications` table (migration 0004), GET surfaces `modifications` per container, `PUT /:id` reconciles full tree in transaction + re-snapshots totals, `POST /:id/email` attaches PDF via Resend + sets `sent_at`, `DELETE /:id` cascades sold + frees inventory state. `lib/s3.ts:getObjectBytes` added. `format.ts:buildLineGroups` consumes per-mod first, falls back to legacy `sold.modification_price` scalar. Dropped unused `PUT /tax`, `PUT /credit`, `DELETE /container/:id`. |
| 3.5 | Server-side `YYYYMM<seq>` generation in `POST /api/v2/invoice` inside `pg_advisory_xact_lock`. Body's `invoice_number` ignored; response includes the assigned number. `CreateInvoice.jsx` dropped its `calculateInvoiceNumber` helper; uses server response for downstream `markContainerSold`. Verified race-safe via 5-way concurrent POST. `GET /api/v2/invoice/latest` removed. |
| 3.6 | S&H month-end pipeline. `server/lib/sh-month-end.ts:generateShMonthEnd(year, monthIndex)` builds one `sh_invoices` row per client with month activity + its `sh_invoice_lines` (in_fee / out_fee / storage_days). Idempotent via `(client_id, billing_month)` unique index. `node-cron@^3` fires `"0 1 1 * *"` from `server/server.js`; gate-off via `SH_MONTH_END_CRON=off`. `routes/v2/sh_invoice.js`: GET list (status filter), GET `/:id`, `POST /run-month-end` (admin), `PUT /:id/send`. |
| 3.7 | `/sh-invoices` tabbed list + `/sh-invoices/:id` read-only detail page with admin Send button. `/api/v2/intake/pending-counts` adds `sh_invoices` count. `PendingAuditNav` rolls it into the navbar bell with a new "S&H invoices" dropdown row. |
| 3.8 | `server/scripts/rerender-all-invoices.ts` — one-shot script with `--limit / --skip-existing / --ids / --dry-run` flags. Not yet bulk-executed; recommended dance is `--dry-run` → `--limit 5` + sample check → full run. |

`2.0` head is the PR 3.8 merge. All feature branches merged via `--no-ff` to preserve phase boundaries.

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

None block Phase 4.

- **Pre-existing global dark-mode bug** — `client/src/styles/inventorylist.css` owns `:root` and `[data-theme=dark]` tokens but is only imported by `InventoryList.jsx` (the file Phase 4 will replace). Resolve naturally as part of Phase 4.
- **40 orphan invoices with no `invoice_containers`** — flagged in PR 1.3 backfill. User to decide before prod cutover.
- **A80 thermal printer** spec — needed before Phase 7.
- **QuickBooks Online vs Desktop** — resolve before Phase 8.
- **Hardware swap** (iPad → rugged Android handheld) — raise inside printer convo.
- **S&H invoice email send** — see "follow-up items" above. Lacks a Puppeteer S&H template; the detail page is HTML-only right now.
- **Historical re-render bulk run** — script is ready (PR 3.8). User to schedule.
- **Spanish translation source** — Phase 6 prep.
- **Help page content** — author vs draft. Phase 6 prep.
- **Staging environment** — none today. Probably worth standing up before `2.0` → `main` cutover.
- **Vite 8 / vitest 4 bumps** — dev-tooling-only esbuild advisories (GHSA-67mh-4wv8-2f99).

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
- **Phase 3 PRs land via `--no-ff` merges** so each PR's diff stays a coherent unit even after later PRs touch the same files. Continue the pattern in Phase 4+.
- **node-cron schedule** for S&H month-end is `"0 1 1 * *"` (01:00 on the 1st of each month). Toggle off in non-prod via `SH_MONTH_END_CRON=off`. Admins can manually trigger via `POST /api/v2/sh-invoice/run-month-end` (defaults to prior month, or pass `{year, monthIndex}`).
- **`pg_advisory_xact_lock` keys**: sales invoice sequence uses `0x4149_5253_4551_4e23` (hex of "AIRSEQ#"), S&H sequence uses `0x5054_4853_4551_4e23`. Different keys so the two domains don't block each other.

---

## At end of session

Update this file in place. Note: what you finished, what's in flight, what's blocked, what the next session should pick up. Don't re-add the per-date session-notes pattern — that lives in `docs/session-notes/` as read-only history from the planning phase.
