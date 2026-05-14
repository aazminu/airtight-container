# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## Phase 5 in flight — PR 5.1 landed, PR 5.2 next

PR 5.1 (reports + mod_presets schema + API) is merged into `2.0` locally. **Next up is PR 5.2 — brand-consistent report templates.** Then 5.3 list/forms, 5.4 dashboard P&L panel, 5.5 dashboard mod-preset admin.

### Phase 5 design decisions (locked 2026-05-14)

- **Four report types**: `delivery_sheet`, `io_report`, `pnl`, `sh_statement`. Each gets its own parameters jsonb shape (validated by a discriminated union in `server/validation/report.ts`), its own generator form (5.3), and its own template (5.2).
- **One Delivery template variant**, not three. No A/B/C pitches — just modernize the existing delivery doc.
- **Strict brand fidelity across every report template.** This is a hard constraint, not a guideline. The invoice template (`client/src/components/templates/invoice/InvoiceTemplate.tsx`, PR 3.1) is the reference. Reports must match:
  - **Fonts**: Archivo Black for display/headers, IBM Plex Sans for body + grand-total values, IBM Plex Mono for tabular/numeric runs (line numbers, IDs). All loaded via Google Fonts `@import` in the CSS module exactly as InvoiceTemplate does.
  - **Logo**: same airtight logo asset (`client/src/assets/images/airtight*.png`). Left in the header strip, slim crop.
  - **Accent**: same red accent bar (CSS var `--accent` from tokens.css) under section titles.
  - **Layout atoms**: slim header (logo left, doc-title right in Archivo Black). FROM/TO (or equivalent) addresses with the centered Archivo Black connector. Items table 8.5pt, sub-rows tight, line numbers in IBM Plex Mono. Summary block with terms left + totals stack right where applicable.
  - **Paper-cream sheet** in print, terms verbatim from InvoiceTemplate where the doc carries them.
- **Dashboard P&L panel**: aggregate cards (sales revenue / cost / profit + S&H revenue) with month/quarter/year toggle + "Generate PDF" button. PDF generation runs through the same Puppeteer pipeline as invoices (`server/lib/pdf.ts`, PR 3.2).
- **Reports list view**: tile grid mirroring `InvoicesGrid.tsx` (PR 3.3), with sidebar facet by `report_type`. Saved-report rows live in `reports` (PLAN §3.3).
- **Mod-presets admin** lands in PR 5.5 as a Dashboard tab. The InvoiceEditor `<datalist>` switches from the hard-coded array (`client/src/components/forms/modificationPresets.ts`) to a fetch against `/api/v2/mod-presets`. Seed migration already inserted the four legacy entries with stable positions 0-3.

### Phase 4 design decisions (locked 2026-05-14)

- **Inventory split:** three tabs — `available` / `pending` / `sold`. Hold rows nest inside `available` with a "Held" badge; `outbound` nests inside `sold` with an "Outbound" badge until Phase 7's printer flow gives `outbound` its own state-flipping path.
- **Mark Outbound is gone.** PR 4.1 deleted `OutboundForm.jsx` + the drawer button. The driver-receipt print in Phase 7 will be what stamps `outbound_date` and flips state to `outbound`.
- **Search/sort:** header search box + per-column header-click sort. No sidebar facet.
- **Editor scope (PR 4.2):** unit#, size, damage, trucking_co, acq.price, notes editable. sale_company + release# read-only (reassignment via Releases page). Sold-row fields read-only with a deep link to /invoices/{n}. Photo strip = PhotoLightbox, read-only. Diff style = per-field background tint with old → new strip.
- **UI copy rule (established mid-Phase-4):** user-facing strings must never reference Phase N / PR N / PLAN.md / branch names / commit shas. Comments in source are fine. See `feedback_ui_language_no_plan_refs.md` in user memory.
- **Yard view:** Units by Type on top, Releases below, S&H last. Per-state columns (Available/Hold = days onsite; Sold = outbound + release#). Outbound boxes don't appear in yard view (state filter is `=== 'sold'`, not `IN ('sold','outbound')` — different semantic than /inventory's Sold tab). Time format pinned to America/New_York via `Intl.DateTimeFormat`.

### PR 5.2 — brand-consistent report templates (next)

Spec:

- Extract shared brand atoms from `client/src/components/templates/invoice/InvoiceTemplate.tsx` into a reusable layer (probably `templates/shared/*` — header strip, accent bar, FROM/TO connector, summary block, paper-cream sheet wrapper). InvoiceTemplate keeps working without changes; shared atoms back both it and the new report templates.
- Build four templates: `DeliveryTemplate.tsx`, `IOReportTemplate.tsx`, `PnLTemplate.tsx`, `ShStatementTemplate.tsx`. Each drives both on-screen detail page + the Puppeteer PDF (mirror `server/lib/pdf.ts` from PR 3.2).
- Replace the legacy `client/src/components/templates/Delivery.jsx` and `client/src/components/reports/DeliverySheet.jsx` with the new template-driven flow.
- Extend the dev-only `/admin/invoice-templates` preview route into `/admin/templates` (or similar) so each report renders with realistic seed data for visual review during development. Same pattern as PR 3.1.
- PDF rendering endpoint: `POST /api/v2/report/:id/pdf` mirrors `POST /api/v2/invoice/:id/pdf` — runs the template through Puppeteer, uploads to S3, sets `pdf_s3_key`.

### Pre-PR-5.2 reading

1. **`client/src/components/templates/invoice/InvoiceTemplate.tsx`** + its CSS module — this is the brand reference. Match it exactly.
2. **`server/lib/pdf.ts`** (PR 3.2) — the SSR + Puppeteer pipeline. Reports route through the same.
3. **`server/routes/v2/invoice.js`** `/pdf` + `/email` endpoints — copy-pasta starting point for `/report/:id/pdf` and `/report/:id/email`.
4. **`docs/PLAN.md` §3.3** — `reports` table shape (already matches the migration shipped in 5.1).

### Open conversations before PR 5.2 work goes deep

- **Logo asset choice** for non-invoice docs — same airtight logo as invoices? (Default: yes, full brand consistency.)
- **PDF naming convention in S3** — `reports/{type}/{id}.pdf` or `reports/{id}.pdf`? (PR 3.2 used `invoices/{invoice_id}.pdf`.)
- **Email-on-generate flow** — auto-email if `emailed_to` was supplied in the POST, or always a separate user action via `/email`? (PR 3.4 has the invoice precedent.)

### Phase 5 status

| PR | Contents |
|---|---|
| 5.1 | Schema + API plumbing for reports + mod_presets. Drizzle migration `0005_phase5_reports_modpresets.sql` creates the `reports` table (per PLAN §3.3) and the `mod_presets` table (id, label UNIQUE, position, created_at). FK from `reports.generated_by → user.id` ON DELETE SET NULL so report history survives a user delete. Migration is idempotent — re-applying on top of a stub table from an earlier drizzle-push tidies the duplicate FK and enforces NOT NULL on generated_at. Seeded mod_presets with the four entries from `client/src/components/forms/modificationPresets.ts`. Routes: `/api/v2/report` (GET list w/ ?report_type filter, GET :id, POST admin create + persist parameters jsonb, DELETE admin) — PDF rendering deferred to PR 5.2 once templates land; `pdf_s3_key` stays null until then. `/api/v2/mod-presets` (GET employee, POST/PUT/DELETE admin; 23505 unique-violations → 409 friendly). Validation: `createReportSchema` is a discriminatedUnion on report_type with per-type parameters shapes; modPresetSchema trims labels + bounds position. 11 + 9 new validation tests bring the server suite from 98 → 118. No client work yet — that starts in 5.2 with templates and 5.3 with the list + generator UI. |

### Follow-up items carried over from Phases 3 + 4

### Phase 4 status

| PR | Contents |
|---|---|
| 4.1 | Tabbed `/inventory` rewrite. New `client/src/routes/Inventory.tsx` + `.module.css`. Three tabs (Available / Pending / Sold) with live counts; Hold rows in Available with a "Held" badge; Outbound rows in Sold with an "Outbound" badge. Header search (full-text against unit#, sale co., release#, damage, notes, trucking co., invoice#, acq.price). Per-column header-click sort with asc/desc toggle + indicators; empties last. Common columns: Unit#, Size, Sale Co., Date Added, Days Onsite, Acq. Price, Release#; Sold tab adds Outbound + Invoice#. Pagination fixed (legacy `+= 1` phantom-page bug removed); 25/50/100 per-page. Stopgap edit modal (replaced in PR 4.2). Server: `GET /api/v1/inventory` LEFT JOINs sale_companies + release_numbers + sold + invoice_containers + invoices to surface `sale_company_name` / `release_number_value` / `outbound_date` / `invoice_number` per row. Legacy retired: `lists/InventoryList.jsx`, `rows/Row.jsx`, `forms/OutboundForm.jsx`, `forms/UpdateForm.jsx`, `SearchContainers.jsx`, `Header.jsx`, `styles/inventorylist.css` (yardview's two depended-on rules moved into `yardview.css`). |
| 4.2 | Inventory edit modal — two-pane diff + confirm. New `client/src/components/forms/InventoryEditor.tsx` + `.module.css`. Replaces the 4.1 stopgap. Two-pane layout inside `<Modal size="lg">`: edit form left, live before→after diff right with per-field accent tint on changed fields. Edit → "Review changes" → confirmation banner + Back/Confirm pair; the PUT only fires on Confirm. Editable fields: unit_number, size, damage, trucking_company, acquisition_price, notes (matching what `PUT /api/v1/inventory/:id` + `PUT /notes/:id` already accept). Read-only display: sale_company_name, release_number_value, intake date, state — each click-fires a passive dismissible banner explaining where to make that change (no alert/modal; doesn't steal focus). Sold-tab rows: outbound_date + invoice_number rendered read-only with an "Edit on invoice page →" deep link to `/invoices/{n}`. Photo strip via `<PhotoLightbox>`; URLs fetched per-row from `GET /api/v1/inventory/:id` (now attaches presigned URLs via `attachPhotoUrls`). `<Modal>` gained a `size` prop (`'md'` default = 520px / `'lg'` = 920px). Follow-up commit fixed: input value was being trimmed on every keystroke (Damage/Trucking ate spaces); editor font defaulted to serif because tokens.css never set body `font-family` (fixed globally). |
| 4.3 | Yard view polish + lazy migration. `YardView.jsx`, `UpcomingOutbounds.jsx`, `YardRow.jsx` → `.tsx`. Section reorder: Units by Type → Valid Release Numbers → Storage & Handling. Per-state columns: Available + Hold cards show Unit / Size / Days Onsite (today − intake; same data for both since state-change history isn't tracked — "Held since" would be misleading). Sold card shows Unit / Size / Outbound / Release #. Manual TZ offset arithmetic at the old `YardRow.jsx:6-22` retired — outbound timestamps now render via `Intl.DateTimeFormat` pinned to `America/New_York` (handles DST + minutes correctly). Latent release# blank fixed: `UpcomingOutbounds` now consumes `/api/v1/inventory` (PR 4.1's JOIN-enriched response) and `YardRow` reads `release_number_value`. Yard view's Sold card still filters to `state === 'sold'` only (outbound boxes drop off this view, unlike /inventory's Sold tab which includes both). New `.yardEmpty` empty-state row + `.yardTimeText` muted-time style. |

### Follow-up items that didn't fit cleanly into Phase 3

- **S&H invoice email send** — the PR 3.7 detail page Send button currently just flips `status -> sent` and stamps `sent_at`. It doesn't actually email the customer. Mirror the sales-invoice `POST /api/v2/invoice/:id/email` Resend-with-PDF-attachment path when the user is ready (probably wrap into Phase 5). Needs an S&H invoice PDF template first — currently the detail page renders an HTML sheet, not a Puppeteer-PDF artifact.
- **Historical re-render bulk run** — `server/scripts/rerender-all-invoices.ts` is written and dry-runnable. Recommended cutover dance per the PR 3.8 commit: `--dry-run`, then `--limit 5` + manual S3 sample review, then full run. Has not been bulk-executed against the local DB or prod yet.
- **`InvoicesGrid` / `InvoiceEditor` UI tests** — PR 3.10 covered the server-side CRUD ops and the `format.ts` template helper but not the React components themselves. Snapshot or RTL tests for the editor (mod reorder, container picker invariants) + grid (search-narrows-sidebar, snap-back) would round out the suite. Not blocking Phase 4.
- **Admin-editable modification presets** — currently hard-coded in `client/src/components/forms/modificationPresets.ts` (4 entries). Promote to a `mod_presets` table with admin CRUD; natural fit for Phase 5 dashboard work. Note added to PLAN §8.
- **Submit-flow round-trip not browser-tested end to end** — the new create flow's submit pipeline (POST → /sold → PUT) has tests covering each piece individually via PR 3.10, but no test exercises the three calls together. The legacy /sold call in particular has no PR 3.10 coverage. Worth a single happy-path Playwright test before prod cutover.
- **InvoiceTemplate `@media (prefers-color-scheme)` audit** — the printable invoice is intentionally paper-cream regardless of UI theme, but the sub-row hover state inside the template renders as an inverted dark band against the cream sheet when the rest of the app is in dark mode. Cosmetic, not blocking.

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
| 3.9 | `/invoices/create` rewritten as a five-step Flow (Containers → Customer → Details → Preview → Done) per PLAN §5. New `routes/CreateInvoice.tsx` + `.module.css` replace the legacy jsx file. Live `InvoiceTemplate` preview on step 4. Submit pipeline: POST `/api/v2/invoice` (server-assigned number) → `/api/v1/inventory/sold` per container → PUT `/api/v2/invoice/:id` so mods/tax/cc/outbound persist via the same reconciliation path as the editor. Deleted: legacy `CreateInvoice.jsx`, `SelectContainers.jsx`, `SelectCustomer.jsx`, `ContainerInvoice.jsx`, `InvoiceForm.jsx` (giant template literal), `invoicecreator.css`. |
| 3.10 | Invoice ops extracted to `server/lib/invoice-ops.ts` (createInvoice, updateInvoiceFull, deleteInvoiceCascade, recomputeTotals, getNextInvoiceNumber, monthPrefix). Route handlers shrink to transaction wrapping. 18 DB-backed integration tests for invoice ops + 5 for S&H month-end (per-test BEGIN/ROLLBACK), 8 client-side tests for `buildLineGroups`. Server suite 75→98, client 23→31. Behavioral fix uncovered by tests: `updateInvoiceFull` now sets `inventory.state='sold'` for every incoming container (not just new-to-invoice ones) so the create flow round-trip lands cleanly. |
| 3.11 | Polish pass. New `client/src/styles/tokens.css` (loaded from `main.tsx`) centralizes design tokens + light/dark variants — was previously trapped inside `inventorylist.css` which only loaded on `/inventory`. `html`/`body` now bg + text themed; native date / search inputs themed via `color-scheme` + dark-mode tints on the calendar/clear indicators. New shared `<Stepper>` primitive (`components/ui/Stepper.tsx`) extracts Intake's numbered-dot progress bar; CreateInvoice uses it. CC fee → "Credit Card fee" everywhere and switched to a percent-input field in both CreateInvoice + InvoiceEditor (user types 3.5, stored as 0.035). Invoice date field added to Details step (defaults to today, label says so). Preview shows `invoice_number` as the literal "PLACEHOLDER" (type widened to `number \| string`). Default destination on each container card pre-fills from the customer's city/state (falls back to street for legacy records); only fills blanks. Modification description input switched to `<input list>` + shared `<datalist>` of presets (`Installation of Rollup Door`, `Paint Job`, `Installation of Man Door`, `Installation of Window`) via `components/forms/modificationPresets.ts`; editable + custom values still allowed. "+ Add modification" moved into the mods subhead to fix the collision. PLAN §8 notes admin-editable mod-preset table as a Phase 5 dashboard follow-up. |

`2.0` head is the PR 3.11 merge. All feature branches merged via `--no-ff` to preserve phase boundaries.

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

- **Legacy `inventorylist.css` still defines its own `:root` token block** — PR 3.11 moved the canonical tokens to `client/src/styles/tokens.css` (loaded globally), but `inventorylist.css` retains the old definitions for backwards compat with the not-yet-rewritten Inventory page. When Phase 4 deletes `InventoryList.jsx`, delete `inventorylist.css` too — tokens are no longer needed there.
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
- **Rate fields are stored as decimals, displayed as percents.** `invoices.tax_rate` and `invoices.cc_fee_rate` are `numeric` decimals (e.g. `0.06625`). The Phase 3 editor + create flow always present them as percents (`6.625`, `3.5`) and convert at the UI boundary via `pctToDecimal` / inline math. Server math is decimal-only; if you add a new rate-bearing field, follow the same convention.
- **Design tokens live in `client/src/styles/tokens.css`**, loaded from `main.tsx`. Defines `--bg`, `--bg-surface`, `--surface` (alias), `--bg-page`, `--text`, `--muted`, `--hover`, `--border`, `--accent`, `--accent-fg`, `--success`/`--danger`/`--warning`/`--info` + corresponding `-bg` / `-fg` pairs, plus radius / shadow / font tokens. Every Phase 3 component CSS module references these as `var(--…)`. Page chrome (`html`/`body`) themed there too. Native date / search inputs picked up `color-scheme: light dark` + dark-mode tints on the OS-rendered indicators.
- **Modification description input is `<input list="modification-presets">`** wherever per-mod line items exist (CreateInvoice Details step, InvoiceEditor). The shared datalist is in `client/src/components/forms/modificationPresets.ts`. Free text still accepted; presets are just typeahead suggestions. Promote to a `mod_presets` table when Phase 5 adds admin CRUD.

---

## At end of session

Update this file in place. Note: what you finished, what's in flight, what's blocked, what the next session should pick up. Don't re-add the per-date session-notes pattern — that lives in `docs/session-notes/` as read-only history from the planning phase.
