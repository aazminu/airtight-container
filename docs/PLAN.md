# Airtight Container 2.0 — Implementation Plan

This plan is the source of truth for the 2.0 rewrite. It captures every decision reached in [V2_TODO.md](V2_TODO.md), [agent_questions.md](agent_questions.md), and the planning conversation. It is meant to be edited as we go — if something here disagrees with reality, update this file first.

---

## 1. Scope & non-goals

**In scope (rolled into 2.0):**
- Step-by-step animated intake flow (Sales + Storage & Handling)
- Brand-new S&H domain (inventory, lifecycle, rate model, month-end billing)
- Pending-audit workflow for both Sales and S&H, surfaced to admins via a navbar dropdown
- Clients page (renamed from contacts), with split address fields, business name, and S&H rate defaults
- Invoice rewrite: tiled list, per-invoice detail page, new template, snapshot totals, PDF-in-S3 storage, historical migration of all 238 prior invoices (240 raw, minus 2 orphan duplicates cleaned up in Phase 1 Step 0)
- Reports rewrite: extensible form-driven generation with saved history
- Inventory page rework: three state-segmented tables, popup edit, fixed pagination/search/sort
- Dashboard facelift with P&L and admin pending count
- Yard view facelift, with S&H boxes visible
- Customers/Clients rolodex
- Help page with FAQs
- Spanish localization on yard-facing flows only
- iPad/mobile compliance on yard + intake flows only
- OCR + S3 image storage at intake
- Sitewide input sanitization + security pass
- Stack upgrade: Vite + TypeScript, Drizzle ORM, Vitest + Playwright, dep audit/slim
- Schema 2.0 with migration + backfill scripts

**Out of scope / explicit non-goals:**
- Inbound trucking cost tracking (not captured today, user opted out)
- Inventory ↔ S&H crossover (boxes can't move between domains)
- Multi-contact-per-client or multi-address-per-client
- Tax-exempt / credit-terms client metadata
- Backwards-pixel-perfect rendering of historical invoices (re-render under new template is fine)
- Mobile-responsive admin views (admin is always on desktop)
- Spanish translation of admin views
- Tracking modifications mid-life (mods captured at sale, same as today)
- Drop / repurpose of any data on prod beyond the migration scripts in this plan

**Deferred for separate conversation (not blocking phases):**
- Thermal printer (A80 / FCC ID 2A6FW-A80) — convo + spec sheet before Phase 7
- QuickBooks Desktop vs Online decision — needed before Phase 8
- Hardware swap (iPad → rugged Android handheld) — to be raised when discussing printer
- OCR field-by-field decode specifics — confer when starting Phase 2 OCR work
- Twilio SMS for driver receipts — low priority, not on the critical path

---

## 2. Stack decisions

| Area | Choice | Why |
|---|---|---|
| Frontend build | **Vite + TypeScript** | CRA is dead, Vite is fast, TS enables Drizzle's typing + reliable refactor |
| Backend | **Keep Express 4 (ESM, Node 20+)** | Working fine; no reason to swap |
| Auth | **Keep Better Auth** | Migration completed 2026-02-24; admin plugin + roles work |
| DB | **Keep Postgres (system service)** | No change |
| ORM | **Drizzle + drizzle-kit** | TS-first, SQL-shaped, integrates with our migration story |
| Email | **Keep Resend** | Already integrated, rate-limited |
| Object storage | **AWS S3** | Box photos, invoice PDFs, report PDFs |
| OCR | **AWS Textract** | ~1 container/day → trivial cost; better accuracy than Tesseract |
| i18n | **react-i18next** | Mature; supports lazy-loaded namespaces (yard-only bundle) |
| Tests | **Vitest (unit) + Playwright (e2e)** | Standard Vite-native pairing |
| Validation | **Zod** | Shared client/server schemas |
| HTML sanitization | **sanitize-html** | For any WYSIWYG / user-supplied rich text in invoices |
| Security headers | **helmet** | CSP + standard hardening |
| PDF generation | **Puppeteer (headless Chromium) in backend** | Render new template HTML → PDF deterministically |

**Dep audit and slim:** Every package in [server/package.json](../server/package.json) and [client/package.json](../client/package.json) gets re-justified during Phase 0. Anything unused or replaceable with std-lib goes. CRA artifacts (`react-scripts`, `web-vitals`, jest-dom test deps) drop with the Vite migration. `react-email` keeps if it earns its keep for the invoice template; otherwise it goes.

**TypeScript scope:** All new code is `.ts` / `.tsx`. Existing files get converted as their phase lands — no big-bang. By the end of Phase 5, the entire client + server should be TS.

**Modularization mandate:** Heavy emphasis on shared UI primitives (Button, Modal, FlowStep, Table, FormField, SearchableSelect, ClientPicker, ReleasePicker, etc.) in Phase 0. The current codebase has at least 4 nearly-identical table-with-search-with-pagination implementations — these collapse to one.

---

## 3. Schema 2.0

Migration strategy: **drizzle-kit migrations**, with a one-shot data-transformation script invoked manually during the cutover weekend. Cutover sequence:

1. Stop traffic
2. Take a pg_dump backup
3. Run drizzle-kit migrations (new tables, columns, constraints, FKs)
4. Run [server/scripts/migrate-data-v2.ts](../server/scripts/migrate-data-v2.ts) (transforms + backfills + invoice re-render)
5. Drop legacy tables
6. Smoke test
7. Resume traffic

### 3.1 Renames & restructures

| Today | 2.0 | Reason |
|---|---|---|
| `inventory.aquisition_price` | `inventory.acquisition_price` | Typo |
| `inventory.unit_number char(12)` | `inventory.unit_number varchar(15)` | Stop padding; allow non-ISO units |
| `inventory.state varchar(10)` | `inventory.state` Postgres enum (`pending`, `available`, `hold`, `sold`, `outbound`) | `varchar(10)` won't hold `checked_out`; enum enforces integrity |
| `inventory.sale_company varchar(20)` (freetext) | `inventory.sale_company_id` FK → `sale_companies` | Denormalization fix |
| `inventory.acceptance_number varchar(15)` (freetext) | `inventory.release_number_id` FK → `release_numbers`, NOT NULL | Enforce "every container has a release" |
| `sold.outbound_date DEFAULT '2024-01-01'` | `sold.outbound_date` nullable, no sentinel | Sentinel-as-undelivered is gross |
| `contacts` table | `clients` table | User rename |
| `contacts.contact_name varchar(25)` | `clients.client_name text` | Field too tight; `text` everywhere |
| `contacts.contact_address varchar(70)` (single field) | `clients.street`, `clients.city`, `clients.state`, `clients.zip` (all `text`) | Single-field hack |
| (no business name) | `clients.business_name text` | Spec requires it as first line on invoice TO: |
| (no S&H defaults) | `clients.default_in_fee numeric DEFAULT 65`, `default_out_fee numeric DEFAULT 65`, `default_daily_rate numeric DEFAULT 1` | Configurable per-client; defaults from user |
| All `varchar(N)` columns | `text` with app-layer Zod validation | Postgres convention |
| `invoices.invoice_number integer` (no UNIQUE) | `invoices.invoice_number integer UNIQUE` | Fix race; use `INSERT ... RETURNING` + retry-on-conflict, or a Postgres advisory lock keyed to YYYYMM |

### 3.2 New columns

| Table | Column | Type | Purpose |
|---|---|---|---|
| `inventory` | `is_pending_audit` | `boolean DEFAULT true` | Pending until admin audits acquisition price + mods |
| `sold` | `material_cost` | `numeric` nullable | Mod material; NULL means "not recorded" |
| `sold` | `labor_cost` | `numeric` nullable | Mod labor; NULL means "not recorded" |
| `invoices` | `subtotal` | `numeric` | Snapshot |
| `invoices` | `tax_rate` | `numeric` | Snapshot (e.g., 0.06625) |
| `invoices` | `tax_amount` | `numeric` | Snapshot |
| `invoices` | `cc_fee_rate` | `numeric` | Snapshot |
| `invoices` | `cc_fee_amount` | `numeric` | Snapshot |
| `invoices` | `total` | `numeric` | Snapshot |
| `invoices` | `pdf_s3_key` | `text` | PDF storage |
| `invoices` | `sent_at` | `timestamptz` nullable | When emailed |
| `release_numbers` | `is_complete` | `boolean DEFAULT false` | Replaces DELETE-when-empty pattern |
| `release_numbers` | `completed_at` | `timestamptz` nullable | History |

### 3.3 New tables

**`release_number_containers`** — enumerated container #s associated with a release when known. Many-to-one with `release_numbers`. Fallback: if a release has 0 rows here, the system falls back to the `release_number_count` decrement pattern. If it has rows, intake auto-associates by matching `unit_number`.

```
release_number_id  int  FK → release_numbers
container_number   text
is_used            boolean DEFAULT false
PRIMARY KEY (release_number_id, container_number)
```

**`sh_inventory`** — separate from sales `inventory`. Same general shape but no `sale_company` / `release_number` / `acquisition_price`.

```
id                  serial PK
client_id           int FK → clients NOT NULL
unit_number         text NOT NULL
size                text NOT NULL
damage              text
intake_date         timestamptz DEFAULT now() NOT NULL   -- admin-overridable
in_fee              numeric NOT NULL                      -- snapshot from client defaults
out_fee             numeric NOT NULL                      -- snapshot
daily_rate          numeric NOT NULL                      -- snapshot
state               sh_state enum ('pending', 'in_storage', 'checked_out')
is_pending_audit    boolean DEFAULT true
checkout_date       timestamptz nullable
notes               text
photos              text[]                                -- S3 keys
```

**`sh_invoices`** — month-end aggregate invoice per client, separate from sales `invoices`.

```
id                  serial PK
client_id           int FK NOT NULL
billing_month       date NOT NULL    -- first of month
invoice_number      int UNIQUE       -- separate sequence from sales
subtotal, tax_rate, tax_amount, total   -- snapshots
pdf_s3_key          text
status              sh_invoice_status enum ('pending_review', 'sent', 'paid')
generated_at        timestamptz
sent_at             timestamptz nullable
UNIQUE (client_id, billing_month)
```

**`sh_invoice_lines`** — line items broken down meticulously per spec.

```
id                  serial PK
sh_invoice_id       int FK NOT NULL
sh_box_id           int FK NOT NULL → sh_inventory
line_type           sh_line_type enum ('in_fee', 'out_fee', 'storage_days')
days_count          int nullable           -- for storage_days lines
rate                numeric                -- snapshot of daily_rate or fee
amount              numeric                -- days_count * rate or fee
description         text                   -- human-readable
```

**`reports`** — saved generated reports (delivery sheets, I/O reports, P&L exports).

```
id                  serial PK
report_type         text                   -- 'delivery_sheet' | 'io_report' | 'pnl' | ...
generated_by        text FK → user(id)
generated_at        timestamptz
parameters          jsonb                  -- form inputs used
pdf_s3_key          text
emailed_to          text[]
```

### 3.4 Drops

| Drop | Why |
|---|---|
| `releases` (the v1 table with `number text[]`) | Dead; v1 route has a bug inserting scalar into array. No client usage. |
| `users` (old pre-Better-Auth) | Better Auth `"user"` is canonical |

### 3.5 Backfills (in [server/scripts/migrate-data-v2.ts](../server/scripts/migrate-data-v2.ts))

0. **Cleanup orphan duplicate invoices.** Delete any `invoices` row that has zero attached `invoice_containers` AND shares its `invoice_number` with another invoice — a legacy double-submit artifact that PR 1.6's `UNIQUE(invoice_number)` constraint would otherwise reject. Today: 2 rows (invoice_ids 122, 123 — both `invoice_number=202505021`, Belleayre Mountain, dup within 1 minute on 2025-05-27). User-confirmed delete 2026-05-12.
1. **Split `contacts.contact_address` → street/city/state/zip.** The script runs in two passes:
   - **Pass A (`--emit-address-csv`):** apply the "split on first comma" heuristic across all 150 historical contacts and emit `server/scripts/migration-data/addresses.csv` with `[contact_id, original_address, parsed_street, parsed_city, parsed_state, parsed_zip, needs_review]`. The `needs_review` flag is set for rows the heuristic can't cleanly resolve (e.g., no state+ZIP tail, or no comma between street and city).
   - User edits the CSV in place to correct unparseable rows.
   - **Pass B (the real backfill run):** consumes the edited CSV. Errors if missing. Step 1 UPSERTs on `clients.id` so re-runs after CSV edits update existing rows.
   - At the eventual prod cutover, regenerate Pass A against then-current prod data (new clients may have been added in the months since), re-edit, re-run.
2. **Map `inventory.sale_company` (text) → `sale_company_id` FK.** The legacy text column is noisy — 32 distinct values, mostly case/whitespace variants of the existing 5 sale_companies, plus 8 apparent new vendors (18W, Beacon, D'Annunzio, DiFazio, LMD, Logistics, Matthews, UBPS — Logitics → Logistics treated as typo) and 5 noise strings (COMPANY, N/A, TEST, RENTAL RETURN, rental) folded to a single `Unknown` placeholder. Normalization map is hard-coded in the script; user-confirmed 2026-05-12. The 8 new vendor names are inserted into `sale_companies`.
3. **Map `inventory.acceptance_number` (text) → `release_number_id` FK.**
   - **3a.** Insert a new `release_numbers` row (`count=0, is_complete=true`) for each orphan `acceptance_number` — 296 inventory rows reference an acceptance number whose `release_numbers` row was wiped by the legacy DELETE-when-count-zero pattern. Each orphan gets its own row so the historical paper trail is preserved.
   - **3b.** Insert a single `LEGACY-UNKNOWN` placeholder for any inventory row with empty `acceptance_number` (id=449 today; paired with Triton from id=449's existing sale_company value).
   - **3c.** Populate `inventory.release_number_id` by matching on `release_number_value`; remaining unmatched rows point at `LEGACY-UNKNOWN`.
   - **3d.** Populate `inventory.sale_company_id`. First pass: inherit `sale_company_id` from the row's `release_numbers` FK when `inventory.sale_company` is null/noise (this gives id=192 a SeaCube sale_company via its real `P534112` acceptance instead of the `Unknown` placeholder PLAN originally suggested). Second pass: normalize the remaining `inventory.sale_company` text values and look up the matching `sale_companies` row.
4. **Compute snapshot totals on the 238 historical invoices** (240 raw minus the 2 orphans removed in step 0) using the *current rates the invoices were sent under* (6.625% NJ tax if `invoice_taxed`, 3.5% CC fee if `invoice_credit`) and the line items in `sold` joined through `invoice_containers`. Formula matches the legacy [InvoiceForm.jsx:341-347](../client/src/components/forms/InvoiceForm.jsx#L341-L347) — `subtotal = Σ floor(sale_price)+floor(modification_price)+floor(trucking_rate)`, `tax = subtotal*tax_rate`, `cc_fee = (subtotal+tax)*cc_fee_rate`. Persist into the new `subtotal`/`tax_rate`/`tax_amount`/`cc_fee_rate`/`cc_fee_amount`/`total` columns.
5. **Nullify `sold.modification_price = 0`.** 280 historical sold rows have explicit zero and 146 already have NULL; convert the 0s to NULL so the column reflects "we don't know" rather than "we know it was free." (Originally a PDF re-render step here — deferred to Phase 3 once the Puppeteer pipeline exists.)
6. **Set `is_pending_audit = false`** on all 656 existing inventory rows (legacy boxes are grandfathered, no audit needed).
7. **Set `is_complete = true`** on any `release_numbers` row with `release_number_count = 0` (no-op today — zero rows match the pre-existing rows, but the 297 new placeholder rows inserted in step 3 are already `is_complete=true`).
8. **Nullify the `sold.outbound_date = '2024-01-01'` sentinel** (280 rows) so the column is honestly NULL when delivery hasn't happened.

The script wraps everything in a single transaction; if any step fails the whole backfill rolls back. After all steps run, the script asserts the preconditions PR 1.6 needs: 0 inventory rows with NULL `release_number_id`, 0 with NULL `sale_company_id`, 0 invoices with NULL `subtotal`, distinct `invoice_number` count = total invoice count.

### 3.6 New constraints / indexes

- `UNIQUE (invoices.invoice_number)`
- `UNIQUE (sh_invoices.invoice_number)`
- `UNIQUE (sh_invoices.client_id, billing_month)`
- FK `inventory.release_number_id` → `release_numbers(release_number_id)` NOT NULL (after backfill)
- FK `inventory.sale_company_id` → `sale_companies(sale_company_id)` NOT NULL (after backfill)
- Index on `inventory.state` (P&L queries filter on it heavily)
- Index on `inventory.is_pending_audit` (admin dropdown count)
- Index on `sh_inventory.state` and `sh_inventory.is_pending_audit`
- Index on `sh_inventory.client_id` (month-end aggregation)
- Index on `invoices.invoice_date` (P&L by month)

---

## 4. Domain models

### 4.1 Sales lifecycle

```
[yard intake]            (yard staff, all roles ≥ employee)
   ↓
[pending]   ← visible in yard view, no badge per user spec
   ↓        ← admin audits: acquisition_price + override date if needed
[available]
   ↓        ← (optional) hold/unhold for a customer
[sold]      ← Mark Sold flow at /invoices/create completes
   ↓        ← Delivery sheet generated at outbound
[outbound]
```

States are a Postgres enum. The "Mark Outbound" button in [Row.jsx:183](../client/src/components/rows/Row.jsx#L183) is removed (artifact). Sold-state transition only happens inside the invoice creation flow.

### 4.2 Storage & Handling lifecycle

```
[yard intake]   (yard staff picks Storage in step 2 of intake flow)
   ↓            (client picker; rates auto-fill from client.default_*)
[pending]
   ↓            (admin audit confirms rates, can override)
[in_storage]
   ↓            (Check Out flow: enter checkout_date, confirm rates, submit)
[checked_out]
```

Day counting: **inclusive** on arrival day. Box arriving Jan 5 and checking out Jan 8 = 4 storage days for Jan.

### 4.3 Releases

- A `release_numbers` row represents a release granted by a sale company.
- Two modes coexist forever:
  - **Count-only**: only `release_number_count` populated. Yard staff picks the release at intake; count decrements on use; when it hits 0, `is_complete=true` and the release hides from intake dropdowns (but stays queryable).
  - **Enumerated**: rows in `release_number_containers` list expected unit numbers. At intake, the unit number is matched against `is_used=false` rows in that table; if matched, auto-associates and marks `is_used=true`. Count decrements alongside.
- Every container in `inventory` keeps its `release_number_id` FK forever — completed releases stay queryable for audit/history. **No more DELETE on the release row when its count hits zero** (the current [v1/inventory.js:74](../server/routes/v1/inventory.js#L74) behavior).

### 4.4 Clients (formerly Contacts)

- One client per (business, person) — no multi-contact, no multi-address.
- Distinguishing sales-only vs S&H-only is not modeled — same client can do both.
- Per-client S&H defaults (`default_in_fee` $65, `default_out_fee` $65, `default_daily_rate` $1) pre-fill at intake; admin can override per-box during audit.

### 4.5 Invoices

**Sales invoices** (existing flow, redesigned):
1. Client picker (typeahead, with "Add new client" shortcut)
2. Container picker (multi-select, available state only)
3. Per-container details: sale_price, trucking_rate, material_cost, labor_cost, destination, line description
4. Tax dropdown (defaults to NJ 6.625%; pre-populated with US state rates), CC-fee toggle (3.5%)
5. Live preview pane (right side of step 3)
6. Generate → renders PDF → uploads to S3 → snapshots totals → marks containers sold → emails (if checkbox set) → redirects to `/invoices/:id` detail page

**Sales invoice number sequencing:**
- Format unchanged: `YYYYMM` + 3-digit sequence (e.g., `2026070001`).
- Generation moved server-side, protected by `pg_advisory_xact_lock(hashtext(YYYYMM))` to serialize concurrent creates.
- `UNIQUE (invoice_number)` enforces it at the DB.

**Invoice template layout changes** (from V2_TODO.md):
- TO: section: Business name → Customer name → Street → City, State, Zip → Phone → Email
- Description section: hide modification line item if `material_cost + labor_cost == 0`
- Three design pitches in Phase 3 PR description; user picks one
- Reach goal: WYSIWYG edit before send. Persisted as a per-invoice `rendered_html_override text` column; regen only happens if override is null.

**S&H invoices** (new):
- Generated by a cron job on the last day of each month at 23:00 ET (drizzle migration adds a `pg_cron` job, or we run via a Node-side scheduler — TBD in Phase 2).
- For each client with any S&H activity in the month, build a single `sh_invoices` row + N `sh_invoice_lines`:
  - One line per box for storage days (inclusive arrival day, capped at end-of-month)
  - One line per box that arrived in the month for in_fee
  - One line per box that checked out in the month for out_fee
- Status starts as `pending_review`. Admin sees a navbar dropdown badge → reviews → clicks "Send" to email and mark `sent`.
- Same PDF/S3 storage model as sales invoices.

### 4.6 P&L

Two perspectives, both surfaced on the dashboard:

**Per-box P&L** (sales):
- Cost = `acquisition_price`
- Sale Price = `sale_price`
- Profit on Box = `sale_price - acquisition_price`
- Mod Revenue = `modification_price` (charged on invoice)
- Mod Expenses = `material_cost + labor_cost`
- Profit on Mod = `Mod Revenue - Mod Expenses`
- Delivery = `trucking_rate` (pass-through; doesn't affect profit since user confirmed delivery fee ≈ driver fee)

**Aggregate P&L:**
- Sales revenue / cost / profit rolled up by month, quarter, year
- S&H revenue rolled up by month, quarter, year (from `sh_invoice_lines`)
- Combined view + separate-stratified-by-domain view

**Reports for P&L:**
- Built as one of the report types in the extensible Reports system
- Generates PDF + CSV-export option
- Saved in `reports` table

---

## 5. UI rework summary

| Page | Today | 2.0 |
|---|---|---|
| Intake (`/add`) | Static form, all-at-once | Multi-step flow with snappy animations: photos → OCR confirm → Sale or Storage → details → submit |
| Inventory (`/`) | One table, broken pagination, broken search | Three tables segmented by state; column sort; fixed pagination; popup edit modal (vertical); "Mark Outbound" removed; S&H section below sales |
| Invoices (`/invoices`) | Table | Tiled grid, filter-by-client, search; click into `/invoices/:id` |
| Invoice detail (`/invoices/:id`) | Doesn't exist | Edit, regen, delete, email, push-to-QB, view PDF |
| Create invoice (`/invoices/create`) | Janky state-loss flow, no preview | Clean step flow with live preview; preserved state across steps |
| Reports (`/reports`) | Just a delivery-sheet form, weird redirect, full-page reload | Form-driven generation; saved history list; extensible report types; in-page render preview |
| Dashboard (`/dashboard`) | Releases + Users tabs only | Facelift; P&L panel; admin-only pending count surface; existing tabs cleaned up |
| Yard view (`/yardview`) | Formatting issues | Cleanup; S&H boxes shown alongside sales by state |
| Clients (`/clients`) | Doesn't exist | New rolodex with edit/create/search; per-client S&H rate defaults |
| Help (`/help`) | Doesn't exist | New page with FAQs + how-the-system-works docs |
| Auth (`/auth`) | Working post-Better-Auth migration | Light touch; ensure clean and mobile-OK (yard staff sign in on iPad) |
| Navbar | Logo overflow bug; placeholder avatar | Logo fix; monogram avatar (first letter of email); bell-icon dropdown with pending-action list |

**Shared component primitives** (built in Phase 0, used everywhere):
- `<DataTable>` with pluggable column defs, sort, search, pagination
- `<FlowStep>` for multi-step animated flows
- `<Modal>` with focus trap + ESC handling
- `<FormField>` with built-in Zod-schema-driven validation
- `<SearchableSelect>` / `<ClientPicker>` / `<ReleasePicker>` / `<ContainerPicker>`
- `<Badge>` (states, counts, status pills)
- `<Toast>` to replace the current `setPopup` context pattern

---

## 6. Security pass

Tracked separately from feature work but interleaved across phases:

- Server-side Zod validation on every route (currently zero validation; req bodies are trusted)
- Output escaping on invoice HTML; replace `dangerouslySetInnerHTML` in [Invoice.jsx:12](../client/src/components/templates/Invoice.jsx#L12) with structured rendering
- `sanitize-html` on any user-supplied rich text (WYSIWYG reach goal)
- `helmet` middleware + CSP
- Tighten Resend wrapper at [server.js:47](../server/server.js#L47): force allowlist of senders, validate `to` matches a known client email or whitelisted internal email
- BCC list (`vagabond7257@gmail.com`, `hlynch02@tufts.edu`, etc.) **stays** per user (intentional for personal logs)
- Audit auth role checks on every route — current code mixes `checkEmployee` and `checkAdmin` inconsistently (e.g., [v2/invoice.js](../server/routes/v2/invoice.js) lets employees create+modify but only admins delete; v1 has mismatched expectations)
- CSRF: Better Auth handles cookie security; verify SameSite + secure flags in prod env
- Rate limiting on more than just auth + email (intake submit, invoice generate)

---

## 7. Phased PR plan

Eight phases, staged. Each phase is one or more PRs; each PR is mergeable to main without breaking prod. Earlier phases create the substrate later phases stand on.

### Phase 0 — Foundation
**Goal:** Stack swap and shared primitives without changing any feature behavior.
- Migrate CRA → Vite, set up TS, port existing `.jsx` to `.tsx` as files are touched (lazy migration)
- Add Drizzle + drizzle-kit; introspect existing schema as the starting point
- Add Vitest + Playwright; one canary test each
- Build shared component primitives ([5 — Shared component primitives](#5-ui-rework-summary))
- Dep audit: remove `web-vitals`, `react-scripts`, jest deps after Vite swap; re-justify everything else
- Add `helmet` + Zod scaffolding
**Exit:** App builds and runs identically on Vite. All feature pages unchanged. Test commands work.

### Phase 1 — Schema 2.0 + Clients page
**Goal:** New schema in prod with all 238 invoices (240 minus 2 orphan duplicates) and 656 inventory rows backfilled.
- Drizzle migrations for all schema changes in [Section 3](#3-schema-20)
- `server/scripts/migrate-data-v2.ts` with the eight backfill steps
- Drop legacy `releases` and `users` tables
- New `/clients` page (rolodex + edit/create) with S&H rate defaults
- Update all existing routes to use Drizzle and the renamed `clients` table
- Cutover weekend
**Exit:** Schema 2.0 live. Clients page replaces nothing visible to non-admins yet. All existing flows work against new schema. Invoice list/detail show migrated invoices with original totals preserved.

### Phase 2 — Intake + S&H domain
**Goal:** New intake flow lands; S&H is fully usable.
- Multi-step Sales intake (photos → OCR → details → submit-as-pending)
- S&H intake branch (client picker, rate confirm, submit-as-pending)
- Pending-audit screen for admins (single screen, both Sales and S&H, with date override)
- S&H inventory + lifecycle (states, day counting, check-out flow)
- Release-number enumeration UX (add container #s to a release; intake auto-association)
- S3 photo upload integration
- Textract OCR pipeline (specifics confirmed at start-of-phase per user's note)
- Yard view shows S&H boxes
- Navbar dropdown for pending actions (sales pending audit + sh pending audit, clickable)
**Exit:** Yard staff intake both flows on iPad. Admins audit + override dates. Boxes flow into available / in_storage states cleanly. Old `/add` route 301s to new flow.

### Phase 3 — Invoices rewrite
**Goal:** Invoice generation/storage/display fully redesigned; S&H invoicing live.
- New invoice template (3 designs pitched in PR description; user picks one)
- Tiled `/invoices` list with filter-by-client and search
- `/invoices/:id` detail page with edit/regen/email/delete
- Snapshot totals + tax-rate dropdown (state defaults)
- PDF generation via Puppeteer + S3 upload
- Historical re-render of 238 invoices through new template (deferred from Phase 1; lands here once the Puppeteer pipeline exists so we can manually verify outputs)
- Server-side invoice number sequencing with advisory lock
- S&H month-end cron job + pending review queue
- S&H invoice detail page (read-only, with Send button)
- Navbar dropdown shows pending S&H invoices alongside pending audits
- Reach: WYSIWYG edit (per-invoice override column)
**Exit:** All invoice flows new. Month-end S&H invoices generate and queue. QB integration not yet started.

### Phase 4 — Inventory + Yard refresh
**Goal:** Inventory + Yard pages match the spec.
- Three state-segmented tables on `/`
- Popup edit modal (vertical) replaces row-stretch edit
- Pagination bug fixed (the `+= 1` thing in [InventoryList.jsx:53](../client/src/components/lists/InventoryList.jsx#L53))
- Column sort by header click
- Search moved into table header
- Remove "Mark Outbound" button
- Yard view facelift
- S&H inventory section on `/` with days-onsite badge + check-out shortcut
**Exit:** Inventory + Yard match design. No regressions.

### Phase 5 — Reports + Dashboard + P&L
**Goal:** Reports and dashboard rewritten; P&L live.
- Reports system rebuilt: form → preview → save-to-`reports` → email
- Saved-report history view
- Three initial report types: delivery sheet, I/O report (currently commented out), P&L
- P&L panel on dashboard (per-box detail + monthly/quarterly/yearly aggregate; Sales/S&H stratified + combined)
- Dashboard facelift
**Exit:** Reports usable, savable, emailable. P&L surfaces all the metrics from user's sheet.

### Phase 6 — i18n + mobile + polish
**Goal:** Yard flows shipped in Spanish, iPad-compliant. Polish items closed.
- react-i18next setup with `en` + `es` bundles loaded lazily for yard flows only
- Nav-bar language toggle
- iPad/mobile compliance audit on Intake + Yard view + Add (admin views remain desktop-only)
- Help page with FAQs (content drafted by user; we wire up the page)
- Logo fix in navbar
- Monogram avatar (first letter of email)
- Profile interaction redesign
**Exit:** Spanish-only yard worker can do their full job. iPad usable in the yard.

### Phase 7 — Hardware (printer + driver receipt)
**Goal:** End-of-intake driver receipt prints to the A80 thermal printer.
- **Prerequisite:** dedicated conversation about A80 spec sheet, connection options, possible hardware swap.
- Driver receipt template (small format, thermal-optimized layout)
- Print integration (likely browser-side ESC/POS via Web Bluetooth or a small native print bridge)
- Optional: Twilio SMS fallback if printer unreliable
**Exit:** Driver gets a printed receipt at end of intake.

### Phase 8 — QuickBooks integration
**Goal:** Selective one-way invoice push to QB.
- **Prerequisite:** QB Online vs Desktop decision.
- "Push to QB" button on `/invoices/:id` and `/sh-invoices/:id`
- Idempotency: track `qb_invoice_id` per invoice so re-pushes update, not duplicate
- Surface push errors in the UI
**Exit:** User can selectively push invoices to QB.

---

## 8. Open follow-ups for implementation time

Things we don't need to decide now but should resolve before they block:

- **Data quality** of the 656 historical inventory rows: how many have NULL/empty `acquisition_price`? Affects whether legacy boxes show up in historical P&L. (Query: `SELECT count(*) FROM inventory WHERE aquisition_price IS NULL;` — Phase 1 prep)
- **Default values for `material_cost` / `labor_cost`** on historical `sold` rows: NULL or 0? (Phase 1 prep)
- **Spanish translations**: do you have a human translator, or use a service (DeepL / Google Translate)? Strings will be small (yard flows only). (Phase 6 prep)
- **Help page content**: do you author the FAQs, or do I draft from observed app behavior for your review? (Phase 6 prep)
- **OCR specifics**: which fields, what regex/parsing rules, error-tolerance behavior. (Phase 2 kickoff convo)
- **A80 thermal printer**: spec sheet, connection (USB/BT/WiFi), iPad pairing nuances. (Phase 7 kickoff convo)
- **QB Online vs Desktop**: any movement on this. (Phase 8 kickoff)
- **Three invoice template designs**: pitch in the Phase 3 PR description.
- **P&L "labor cost" granularity**: single number per box is the plan. Confirm one more time when we wire the audit screen — easy to expand if you change your mind.
- **Reports library extension**: design `report_type` to be enum-extensible. Future report ideas you have should land in this file as they come up.
- **Admin-editable modification presets**: the per-modification line-item dropdown in the invoice editor + create flow currently uses a hard-coded list (Installation of Rollup Door, Paint Job, Installation of Man Door, Installation of Window — `client/src/components/forms/modificationPresets.ts`). Promote to a small `mod_presets` table with admin CRUD on the dashboard so Michelle can add / edit / remove without a deploy. Phase 5 dashboard work is the natural home.

---

## 9. What this plan deliberately does *not* address

- Performance benchmarks / SLOs (not currently a bottleneck; 656 rows is nothing)
- Monitoring / observability (none today; could add Sentry in a polish pass, not blocking)
- Backup strategy (Postgres on EC2; presumably existing AWS snapshot policy — flag if not)
- Disaster recovery beyond the cutover pg_dump
- Staging environment (deploys today go straight to prod via GHCR + SSH). If we want a staging env for the cutover weekend dry-run, it's a Phase 1 prep task; flag if so.
- Tests for legacy code: existing routes get tests as they're rewritten in their phase, not retroactively.
