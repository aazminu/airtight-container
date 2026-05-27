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

### Phase 7 — Driver receipt: triple-channel delivery (email + SMS + AirPrint)
**Goal:** At outbound the driver gets the delivery sheet through whichever channels apply — email, SMS, paper. Admin picks per-driver in a single Send-to-Driver action.

**Direction change 2026-05-18:** the original A80 thermal printer is the wrong hardware (FCC ID `2A6FW-A80` resolved to a Xiamen Print Future Technology A4 mobile document printer, not an 80mm POS receipt printer — no ESC/POS, no web SDK, takes 216mm letter-format thermal sheets). Apple Safari has no Web Bluetooth, so any Bluetooth thermal printer is also out from the iPad. New hardware path: **Star TSP654II AirPrint-24** (Apple-certified AirPrint, ethernet) + **GL.iNet GL-MT300N-V2 Mango** as a local-WiFi-only bridge (no internet uplink — printer + iPad on the same LAN, iPad continues to use cellular for internet, AirPrint over WiFi). Yard-coverage caveat: the steel-container Faraday-cage problem means the router has to be where the iPad and printer both live at print time. Phase 9.8 lands the print integration once hardware is on hand; 9.6 covers email + SMS without depending on the printer.

- **Software side (lands in Phase 9.6 + 9.8):** see those PRs below.
- **Hardware buying list (operator):** Star TSP654II AirPrint-24 (part `39481870`), GL.iNet Mango (`GL-MT300N-V2`), 80mm thermal paper, 5V/2A USB wall plug for the router. ~$300–500 all-in depending on new vs. refurbished printer.
- **Twilio account + A2P 10DLC brand & campaign registration** (operator) — registration takes 2-5 business days to clear, kick off early so SMS can deliver in production by the time 9.6 lands.

**Exit:** Operator hits one "Send to driver" action on the delivery sheet detail page; email + SMS go out automatically, and paper drops if the iPad is on the yard's local WiFi.

### Phase 8 — QuickBooks integration
**Goal:** Selective one-way invoice push to QB.
- **Prerequisite:** QB Online vs Desktop decision.
- "Push to QB" button on `/invoices/:id` and `/sh-invoices/:id`
- Idempotency: track `qb_invoice_id` per invoice so re-pushes update, not duplicate
- Surface push errors in the UI
**Exit:** User can selectively push invoices to QB.

### Phase 9 — Standardization & admin presets
**Goal:** Replace freetext size / damage with admin-managed picklists, give mod-presets default prices, clean up the invoice line description, harden OCR against common character confusions. Unblocked — can land in parallel with Phase 7 / Phase 8.

- **PR 9.1 — Size + Damage preset tables.** New `size_presets` and `damage_presets` (id, label UNIQUE, position, created_at) shaped like `mod_presets`. Seed sizes: `10'DV`, `10'HC`, `20'DV`, `20'HC`, `40'DV`, `40'HC` (DV = dry van / standard, HC = high cube). Seed damage: `New`, `WWT` (wind & water tight), `As-is`. Two new Dashboard admin tabs (Container Sizes + Damage Types) mirror the Mod Presets tab CRUD (add / edit / reorder / delete; 23505 → 409 on duplicate label). Intake size / damage fields + `InventoryEditor` swap to `<input list>` sourced from the new tables (same pattern as mod descriptions). Size + damage stay `text` on `inventory` / `sh_inventory` — no FK — so a deleted preset doesn't strand historical rows; deleted presets just drop out of the dropdown. Backfill: migration script maps existing freetext to nearest preset, emits a CSV of unmatched values for user review, second pass writes the corrected mappings (same workflow as the Phase 1 address split). Hooks: `useSizePresetLabels()` / `useDamagePresetLabels()` mirror `useModPresetLabels()`.
- **PR 9.2 — Mod-preset default prices.** Add `mod_presets.default_price numeric nullable`. Admin tab gains a price column with inline edit; POST/PUT accept the price. `CreateInvoice` + `InvoiceEditor` autofill `modification_price` when the user picks a preset (only when the field is empty so we don't clobber a typed value). `useModPresetLabels()` extends to return `{ label, default_price }` tuples.
- **PR 9.3 — Invoice line description = `[Size] [Damage] [Unit#]`.** `format.ts:buildLineGroups` prepends size + damage (joined live from `inventory`) to the parent line's description (e.g. `20'DV WWT TCKU‑287291‑3`). The per-container line description / notes field on invoices is dropped from the template and from the `CreateInvoice` / `InvoiceEditor` UI. `inventory.notes` stays — yard staff still use it for non-invoice context. Legacy invoices re-render under the new format on next regen (size + damage join live from `inventory`, not snapshotted on `sold` — confirm at PR time that sale-time values stay readable). Deliver-To banner at the top of the invoice is unaffected.
- **PR 9.4 — OCR character-disambiguation.** Current failure mode: Textract returns `O` for `0` (and 1/I, 5/S, 8/B confusions) on grimy / low-contrast container plates. `server/lib/textract.ts` adds a candidate-expansion pass — for the digit positions of ISO 6346 (5-10 + check digit), substitute common look-alikes (O→0, I/L→1, S→5, B→8, Z→2, G→6, T→7) and accept the first candidate that check-digit-validates; for the alpha prefix (positions 1-4), enforce position-4 = `U` (container category) regardless of Textract's read. Add a regression suite of raw Textract responses sampled from the failing images so future tweaks don't backslide.
- **PR 9.5 — Invoice tombstone on delete.** DELETE keeps the row, sets `deleted_at`, clears `pdf_s3_key`, deletes invoice_containers, returns inventory to `available`. Keeps the YYYYMM sequence contiguous so the operator can see which numbers are intentionally vacant. UI: striped tile + "Deleted" badge in the grid, tombstone notice on detail page; PUT / regen-PDF / email all 409 on tombstoned invoices.
- **PR 9.6 — Driver-receipt SMS + "Send to driver" flow.** New optional step in delivery-sheet creation captures driver contact (name / phone / email) into `reports.resolved_data`. ReportDetail (delivery_sheet only) gains a "Send to driver" modal with Email + SMS checkboxes (Print arrives in 9.8); each checkbox shows the captured contact and lets the operator confirm or override inline. If contact info wasn't captured at create-time, the modal prompts for it on first send. Server: Twilio integration in `server/lib/sms.ts`; new `POST /api/v2/report/:id/sms` admin-gated and gated to `report_type='delivery_sheet'`; new `report_receipt_links` table (`token`, `report_id`, `expires_at`, `accessed_at`, `revoked_at`) and a public unauthenticated `GET /r/:token` route that 302-redirects to a fresh presigned S3 URL for the delivery-sheet PDF. Each send generates a new token (old tokens stay valid until 30-day expiry). SMS body is single-segment (≤160 char): `Airtight: Delivery sheet for {unit}. https://airtightshippingcontainer.com/r/{token}` — no PII in the body so a wrong-number mis-send leaks only a generic phrase. Twilio account + A2P 10DLC operator-side prerequisite (see Phase 7). Migrations `0011_report_receipt_links.sql`, `0012_reports_sms_sent_at.sql`, and a delivery-sheet validation-schema update accepting the optional driver fields.
- **PR 9.7 — Outbound state from the delivery sheet's date.** Container state flips `sold → outbound` from `delivery_sheet.outbound_date`, not from a discrete operator action. On delivery-sheet create / update, if `outbound_date <= today` and the linked container is `state='sold'`, eager-flip to `'outbound'`. A `node-cron` "0 5 * * *" daily job (same scaffold as Phase 3's S&H month-end) catches future-dated rows as they come due. One-way: once a container is `'outbound'`, editing the date back to the future does NOT revert it (physical boxes don't come back). One-shot backfill in the migration flips existing `'sold'` rows that have a past-dated delivery-sheet outbound. Removes the long-standing "Mark Outbound is gone; Phase 7 will stamp it" gap.
- **PR 9.8 — AirPrint print channel.** Once Star TSP654II + Mango router are physically deployed: Send-to-Driver modal gains a Print checkbox, enabled when iPad is on the yard's local WiFi network (detected via a no-internet network heuristic + cached "this is the yard SSID" preference). Print path renders a receipt-format delivery-slip template (existing letter `DeliveryTemplate` adapted to 80mm-portrait CSS), calls `window.print()`, lets iOS show AirPrint picker, paper comes out. **Blocked on hardware arrival.**

**Exit:** Size + Damage are picklists end-to-end with admin CRUD. Mod presets carry default prices that autofill. Invoice line items show `[Size] [Damage] [Unit#]` with the per-line notes column gone. OCR success on the regression set is materially up. Invoice deletes leave navigable placeholders. Drivers receive their delivery sheet via email / SMS / paper from one operator action; outbound state flips automatically from the delivery sheet's date.

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
- **Admin-editable modification presets**: the per-modification line-item dropdown in the invoice editor + create flow currently uses a hard-coded list (Installation of Rollup Door, Paint Job, Installation of Man Door, Installation of Window — `client/src/components/forms/modificationPresets.ts`). Promote to a small `mod_presets` table with admin CRUD on the dashboard so Michelle can add / edit / remove without a deploy. Phase 5 dashboard work is the natural home. **Update 2026-05-16:** landed in Phase 5; Phase 9.2 extends with `default_price` for autofill.
- **OCR regression sample collection** (Phase 9.4 prep): user has images where Textract misread `0` as `O` (and similar digit/alpha confusions). Collect the offending raw Textract responses + source images for the regression suite before opening 9.4. Keep them out of git — drop into `server/scripts/textract-fixtures/` (gitignored) and reference by hash in test names.
- **Size + Damage preset values** (Phase 9.1): seed `10'DV`, `10'HC`, `20'DV`, `20'HC`, `40'DV`, `40'HC` for size; `New`, `WWT`, `As-is` for damage. DV = dry van (standard), HC = high cube. Admin can add / edit / remove from the dashboard after seed.
- **Bug — emailed invoice PDF omits modification line items.** Two stacked causes: (1) `POST /api/v2/invoice/:id/email` ([server/routes/v2/invoice.js:390-398](../server/routes/v2/invoice.js#L390)) only re-renders when `pdf_s3_key` is null, so any edit after first render (mods added, prices changed) leaves the cached S3 PDF stale. (2) Even on a fresh render, `fetchInvoiceData` in [server/lib/pdf.ts:92-193](../server/lib/pdf.ts#L92) never joins `sold_modifications` — only the legacy `sold.modification_price` scalar. `InvoiceData.containers[]` has no `modifications` field, and the compiled invoice template bundle doesn't render per-mod rows. Compare to [server/lib/invoice-ops.ts:114-122](../server/lib/invoice-ops.ts#L114) which does it correctly. Fix scope: add `sold_modifications` join + group into `containers[].modifications[]`, extend `InvoiceData` type, render mods in the React invoice template, and invalidate `pdf_s3_key` on any invoice edit (or always re-render on email send — cheaper and correct).

### Operator-meeting feedback — 2026-05-26

- **"Quote" as a first-class document type — persistent, reusable, separate from invoices.** A quote is essentially an "invoice without containers": it has line items, pricing, modifications, and a client, and is **editable, emailable, and printable as a Quote document** in its own right. A quote is *never consumed* — at any time the operator can run an "Assign containers → spawn invoice" action that creates a new full-fledged invoice (copying the line items + attaching the chosen containers), leaving the quote untouched. The same quote can spawn multiple invoices over its lifetime — it functions like a template, but the operator doesn't have to think about it as one. No expiration. Implementation implications: quote needs its own document type / numbering separate from `invoices` (e.g. `quotes` table, `Q-YYYYMM-NNNN` numbering), its own PDF template that says "Quote" not "Invoice", and a "Promote to Invoice" affordance that takes a container picker. Solves the deferred "invoices-sans-containers" thread (HANDOFF.md) and the reorg friction the operator hits when pricing boxes not yet on the lot.
- **Unit number display: insert a space between prefix and digits site-wide.** Format: split at the first digit so `TCLU1234567` → `TCLU 1234567`. Applies to *all* unit numbers regardless of prefix pattern — non-conforming legacy units get whatever the same split rule produces (e.g., `40HC123` → `40 HC123`, since the split is at first digit). Display-only; storage stays `char(12)`.
- **"Add new Client" inline everywhere a client selector exists.** Site-wide rule: any flow that picks a client (invoice editor, intake, release, S&H invoice, anywhere else) must expose a `+ New Client` option that opens a modal, persists the new row, and re-selects it back into the calling flow without unmounting the parent. Goal is "operator never has to leave the current flow to create a missing client."
- **Email-on-send back-fills `client.contact_email`, with conflict prompt.** When the operator emails an invoice to a recipient: if the client has no email on file, silently save the typed-in `to` onto the client; if the client *has* a different email on file, prompt "Update email on file from `<old>` to `<new>`?" before persisting. Hook into [server/routes/v2/invoice.js:368](../server/routes/v2/invoice.js#L368).
- **Modal backdrop click discards data only when the form is dirty — show a confirm prompt.** Clean modals (no edits, read-only popups) close normally on backdrop click. Dirty modals require an explicit "Discard changes?" confirmation before the backdrop click destroys state. Repo-wide modal audit; standardize via a single shared `<Modal>` primitive if not already centralized.
- **Confirm-redirect on dirty forms — site-wide navigation guard.** Same principle as the modal-backdrop rule, scoped to *page-level* navigation: if the operator is mid-filling-out a form (any dirty state) and clicks a nav link, presses back, refreshes, or closes the tab, intercept with "You have unsaved changes — discard?". Two layers: (1) in-app routing via `react-router` `useBlocker` (v6.4+) tied to a shared `useDirtyForm()` hook every form opts into, (2) browser-level via the `beforeunload` event so tab close / refresh / external nav also prompt. Forms that aren't dirty navigate freely. Composes with the modal-backdrop rule via the same `useDirtyForm()` registry.
- **Email optional in Add-Client form.** Schema already permits null (`contact_email nullable`); the form is the gate. Remove the required asterisk + frontend validation, and roll in the empty-string-`→`-null coercion that triggered the 400 we hit in the meeting (`server/validation/client.ts`).
- **Outbound date moves out of the invoice flow and into the receipt-print event.** Operator says outbound date belongs to delivery, not invoicing. Remove the field from the invoice editor entirely; set `sold.outbound_date` automatically when the driver receipt is printed (Phase 7 territory). See the new "container lifecycle / outbound flow" thread below — receipt-print as the outbound trigger implies delivery sheets are a side-effect, not the source of truth, and the lifecycle needs a real outbound flow modeled.
- **Currency input normalization site-wide — leading `$`, no leading zeros, cap to 2 decimal places.** Every money field (modification price, sale_price, trucking_rate, acquisition price, tax, discount, S&H rate, anything else) uses a shared `<CurrencyInput>` primitive that: (1) displays a leading `$`, (2) strips leading zeros (`$025.50` → `$25.50`), (3) clamps to exactly 2 decimal places on blur (`$25.5` → `$25.50`, `$25.567` → `$25.57` with HALF_EVEN rounding), (4) accepts paste of unformatted input and normalizes it, (5) blocks non-numeric keystrokes other than `.`. Stored value remains a `numeric(N,2)` decimal — the `$` and formatting are display-only. Subsumes the original leading-zero-on-mod-price item.
- **Mod line-item delete: swap X glyph for trash icon, add spacing from the price field.** The current X sits too close to the price input and reads like a `+` at a glance, causing accidental deletes mid-edit. Trash icon + horizontal breathing room.
- **Make the "Add modification" button bigger.** Operator can't reliably tap it on iPad. Bump padding/size; consider a full-width button under the mod list instead of an inline `+`.
- **Site-wide popup / toast error verbosity sweep — bundle as one large PR.** Today most caught errors render "Internal server error" or "Something went wrong" and the operator can't self-serve. Sweep every catch block + frontend toast call site to surface the actual cause: backend validation errors (`errors.fieldErrors`), domain errors (e.g. `409: Release number already exists`), Resend / S3 failures, etc. Verbose by default; only redact when the message could leak sensitive infra detail. Composes with the err-message-hygiene work in PR #11 (`docs/SECURITY_PLAN.md`).
- **"Download PDF" button on invoice detail.** Lives next to "Email" on `/invoices/:id`. **Always re-renders fresh and overwrites the cached `pdf_s3_key` in S3** — same approach should apply to email send once the mods-not-rendered bug is fixed, so the cached object is always the latest. Streams the bytes to the browser instead of attaching to a Resend email.
- **Container lifecycle / outbound flow — design conversation needed.** Operator flagged that delivery sheets are currently a *side-effect* of receipt-printing rather than the source of truth, and there's no first-class outbound event in the model. Outbound date moving onto the receipt-print event (above) makes this concrete: we need a real outbound flow that owns the state transition (in-yard → delivered), stamps `outbound_date`, optionally captures driver / signature / receipt copy, and treats delivery sheets as a downstream artifact. Convo to scope before / alongside Phase 7 (driver receipt) work — Phase 7's printer + SMS pieces probably hang off this same event.
- **Phone number normalization to `XXX-XXX-XXXX` (+ optional `EXT. XXXXX`).** Site-wide canonical format with dashes. Anything past 10 digits is appended as `EXT. XXXXX`. Examples: `5551234567` → `555-123-4567`; `(555) 123-4567 x1234` → `555-123-4567 EXT. 1234`. Three pieces: (1) server-side normalizer in `server/validation/client.ts` (and anywhere else phone is captured) that strips non-digits, splits 10+ext, formats; (2) Zod regex enforces the canonical shape on writes; (3) one-shot migration script (`server/scripts/normalize-phones.ts`) that runs the same normalizer over all existing `clients.contact_phone` rows. Watch the `contact_phone` column width — `EXT. 99999` adds 10 chars, so a `text` column is fine but a `varchar(20)` would clip; verify and widen if needed.
- **Address autofill via Google Places Autocomplete (New) on the client form.** Industry standard for US address entry in 2026; structured response maps 1:1 onto the existing split-address schema (`street/city/state/zip`). At this volume the $200/mo Google Maps free credit covers it indefinitely. Integration: `@googlemaps/extended-component-library` `<gmp-place-autocomplete>` web component in the ClientForm street field; on selection, populate `street/city/state/zip` from the structured result; keep manual entry available as a fallback. Requires a `GOOGLE_MAPS_API_KEY` (HTTP referrer-restricted, Places API enabled). Mapbox is the alternative if we ever want off Google.

---

## 9. What this plan deliberately does *not* address

- Performance benchmarks / SLOs (not currently a bottleneck; 656 rows is nothing)
- Monitoring / observability (none today; could add Sentry in a polish pass, not blocking)
- Backup strategy (Postgres on EC2; presumably existing AWS snapshot policy — flag if not)
- Disaster recovery beyond the cutover pg_dump
- Staging environment (deploys today go straight to prod via GHCR + SSH). If we want a staging env for the cutover weekend dry-run, it's a Phase 1 prep task; flag if so.
- Tests for legacy code: existing routes get tests as they're rewritten in their phase, not retroactively.
