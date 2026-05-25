# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## Phases 1–5 complete on `2.0`. Phase 6 partial (yard i18n + mobile audit done; Help content shipped). **Phase 9: PRs 9.1–9.8 all merged on `2.0`** as of 2026-05-18 (server 182 tests, client 52 tests). Triple-channel driver receipt (email + SMS + AirPrint) feature-complete in code. **A2P 10DLC consent gate + public privacy policy landed 2026-05-25** in response to Twilio campaign rejection (commits `96a8a07`, `e0cf29c`). AirPrint hardware leg proven via iPhone smoke; iPad-on-yard-WiFi E2E pending. **Sales-invoice lifecycle status (uncommitted on `2.0`)** in response to operator request (see "Invoice status" section below). Phase 8 (QB) deferred.

**Invoice status (PR 10.1) — uncommitted on `2.0` 2026-05-25.** Sales invoices now carry a real lifecycle status, closing a long-running gap (S&H invoices had a status enum since PR 3.6; sales did not). Drives client expectations (paid vs not), surfaces overdue invoices, and lets the operator mark "deal fell through" without using the tombstone path (which is reserved for operator mistakes).
- States: `draft | awaiting | paid | delinquent | cancelled`. Default `draft` on creation. Emailing flips draft → awaiting (other states don't downgrade). Delinquent is operator-marked; UI shows a "≥ 30 days unpaid" hint on awaiting invoices past the threshold but never auto-flips. Cancelled coexists with tombstone (`deleted_at`) — different semantics.
- Migration `0015_invoice_status.sql` adds the enum + `status_changed_at` + `status_changed_by_user_id` audit columns + a backfill that marks all 238 existing non-tombstoned invoices `paid` (avoids dashboard poisoning at cutover). Applied to local DB.
- Server: `PATCH /api/v2/invoice/:id/status` (admin) with enum validation + 409 on tombstoned rows. `POST /:id/email` UPDATE now also flips draft → awaiting + stamps audit columns in the same write. `INVOICE_SELECT_COLS` + `groupInvoices` carry the new fields through.
- Client: shared `components/lists/invoiceStatus.ts` provides badge tone + label + the 30-day overdue rule. `InvoicesGrid` gains status sidebar facet (counts per status), status badge per tile (color-coded), "≥ 30 days unpaid" tile badge. `InvoiceDetail` gains a status bar above the actions with the badge + audit line + admin transition dropdown; confirmation modal gates `cancelled`. `InvoiceData` type widened with `status` + audit fields.
- Tests: 1 new invoice-ops test (default `'draft'` on createInvoice + audit columns null until first transition). Server suite 181 → 182. Client stays at 52 (3 tile tests updated to use the new aria-label "Filter invoices"). API smoke + UI smoke green.

**SMS consent (A2P 10DLC) — 2026-05-25, both responses to the Twilio campaign rejection landed on `2.0`.** Rejection cited "opt-in consent language missing or non-compliant" + "privacy policy can't be verified" (live, but auth-gated). Both fixed: operator-attestation consent flow + public `/sms-terms` (commit `96a8a07`); public `/privacy-policy` (commit pending). **End-to-end smoked 2026-05-25** — Playwright drove the dialog open, confirmed disclosure render, attestation gate (Send disabled until checkbox ticked), API consent payload, and 503-with-clean-toast when Twilio creds absent. Curl confirmed all four consent-rejection paths return 400 with correct messages. `/sms-terms` rendered unauthenticated. **Privacy-policy page** at `client/src/routes/PrivacyPolicy.tsx` — 12 sections, narrow scope (SMS + customer comms), names Twilio/Resend/AWS as sub-processors, cross-linked with `/sms-terms`. No lawyer review (deferred until next time one's billed for anything else; not blocking Twilio resubmission).

**Resubmission checklist:** when running the Twilio A2P 10DLC campaign form again, set the messaging policy URL to `https://airtightshippingcontainer.com/sms-terms` and the privacy policy URL to `https://airtightshippingcontainer.com/privacy-policy`. Both will be reachable without auth after 2.0 deploys.

**9.8 AirPrint smoke — partial 2026-05-25.** Hardware arrived, wired up indoor (Mango USB-powered, Star plugged into Mango LAN port, printer IP 192.168.8.221). iPhone joined Mango WiFi → Safari Share → Print → Star appeared in AirPrint picker → paper dropped. That validates the entire iOS-AirPrint-Star path, which is the higher-risk half. Still pending: `/reports/:id/print` E2E on a real iPad joined to the Mango network — straightforward iOS-Safari-hits-dev-server test once the operator's iPad is back online (currently in iCloud activation-lock recovery).
- Migration `0014_reports_sms_consent.sql` adds `sms_consent_at`, `sms_consent_by_user_id`, `sms_consent_text_version` to `reports` (already applied to local DB). Drizzle schema updated to match.
- `server/lib/sms-consent.ts` defines `CURRENT_SMS_CONSENT_VERSION = 'v1-2026-05-25'` + `validateSmsConsent()`. `POST /api/v2/report/:id/sms` now refuses (400) without `consent: { attested: true, text_version }` in the body and stamps the three audit columns on success. 9 new unit tests cover the validator.
- `client/src/lib/smsConsent.ts` is the SoT for the disclosure text shown to the operator. Bumping the disclosure means bumping the version constant in both files in lockstep.
- `client/src/components/forms/SendSmsDialog.tsx` replaces the old `usePrompt`-style flow in `ReportDetail.tsx`. Full disclosure rendered inline + required attestation checkbox + phone validator. Send button disabled until both pass.
- Public `/sms-terms` page (`client/src/routes/SmsTerms.tsx`) renders the same disclosure for Twilio campaign reviewers to verify without logging in. Wired through `App.jsx` route table + `restaurantcontext.jsx` auth-redirect exclusion. Navbar hidden on that path.
- `CreateReport.tsx` Driver step copy reworded — capturing phone there does NOT count as consent; the dialog is the consent gate.
- **Operator next steps:** apply migration 0014 locally → smoke-test the dialog → after 2.0 deploys, resubmit the Twilio campaign citing https://airtightshippingcontainer.com/sms-terms as the messaging policy URL. Twilio's reviewers will fetch that URL without auth.
- Pre-existing tsc errors in `InvoiceEditor.test.tsx` and `InvoicesGrid.test.tsx` (4 total, `'global'` not typed) survived from the 2026-05-18 baseline — HANDOFF's "tsc clean" claim was overstated. Trivial drive-by (`globalThis` swap) when next in the area.

**Phase 5** — PRs 5.1 (schema + API), 5.2 (brand-consistent templates), 5.3 (resolvers + PDF/email + UI), 5.4 (Dashboard P&L panel), and 5.5 (release_summary report + /releases page rework) are merged into `2.0` locally. Direct follow-ups on `2.0`:
- Dialog refactor (replace native confirm/prompt with styled dialogs).
- Release-quota fix (drop intake decrement, auto-bump on overflow, conservative `0007` backfill).
- Mod-preset admin Dashboard tab + InvoiceEditor/CreateInvoice datalist swap to `useModPresetLabels()` against `/api/v2/mod-presets`.
- Dashboard polish: shared `.inventoryTable` / `.tableBtn` styles defined (they were referenced but had no CSS), `.hidden` class added (it was being used to toggle tabs but didn't exist), Releases tab dropped (the /releases page replaces it), tab strip restyled to centered text + accent underline.
- **Dashboard P&L expansion (recharts ^3.8.1)** — KPI strip (6 cards), trend LineChart over 3/6/12/24 prior periods, top-clients BarChart, yard snapshot (state donut + size bars + pending-audit/flagged-damage footers). New backend endpoints: `GET /api/v2/pnl/{timeseries,top-clients,yard}` with helpers in `server/lib/report-resolvers/dashboard-extras.ts` + a `previousPeriod()` helper on the P&L resolver.
- **P&L per-container drill-down** — clicking Sales Rev / Sales Cost / Net Profit / Avg Revenue per Box on the dashboard opens a Modal table of every container that contributed to the period (Unit#, Invoice date, Client, Sale, Acq cost, Mod rev/cost, Trucking, per-row Profit). Focused column highlights based on which card you clicked. New endpoint `GET /api/v2/pnl/breakdown` + `resolvePnlBreakdown()`.

**Phase 6 — i18n + mobile + polish (partial):**
- **i18n scaffold landed.** `i18next` + `react-i18next` + `i18next-browser-languagedetector` installed. Single `yard` namespace covering every English string a yard worker sees. Bundles at `client/src/i18n/locales/{en,es}.json`; Spanish is a first-pass draft and would benefit from a native review before prod. Selection persists in localStorage. Navbar gains an EN/ES segmented toggle. Admin flows stay English-only (yard-only scope per PLAN §7).
- **Yard-flow strings wrapped:** Navbar yard items, YardView page, UpcomingOutbounds (state cards, table headers, pagination, popups), ReleaseNumbers, ShYardSection, Intake.tsx + all 6 step components (PhotoStep, ConfirmStep w/ `<Trans>` + `<strong>` for bold OCR feedback, SalesDetailsStep, ShDetailsStep, SalesReview, ShReview). Two narrower keys (`read_success_no_size`, `matched_release_no_company`) handle the case where OCR didn't pick up a size or release company.
- **iPad/mobile compliance fixes:** Photo-tile remove button 24px → 40px+, ShYardSection date input 36px → 44px, `inputMode`/`autoCapitalize` hints across intake form fields, iPad-portrait breakpoint on yardview (3-col → 2-col → 1-col), horizontal scroll affordance on `.yardScrollWrap`. Audit punch list applied in full.
- **Navbar polish:** new `UserAvatar` monogram component (palette-hashed initial), logo gets a real height, profile dropdown gains role line + click-outside / ESC-to-close + danger-tint logout. Old `profile.png` and the `onMouseOver` width-swell are gone.
- **`/help` route stub** — minimal contact-Michelle card so the navbar link doesn't 404. Real content per the PLAN §8 follow-up ("does the user author the FAQs?") is still pending.

**Phase 9 — standardization & admin presets** (added 2026-05-16). Four PRs, all unblocked from upstream phases; merged in order via `--no-ff` on 2026-05-16:
- **9.1 MERGED** (b78cbc3). Migration 0008 added `size_presets` (10'/20'/40'DV+HC + 45'HC) and `damage_presets` (New/WWT/As-is); 23 inventory rows folded `NA → As-is`. Generic `<PresetsAdmin>` extracted from `ModPresetsAdmin.tsx`; size + damage land as wrappers in two new Dashboard admin tabs. `useSizePresetLabels()` + `useDamagePresetLabels()` mirror `useModPresetLabels()`. `SalesDetailsStep`, `ShDetailsStep`, `InventoryEditor` swap size + damage inputs to `<input list>` + shared `<datalist>`. Drive-by fix: Drizzle wraps pg errors in `DrizzleQueryError`, so `err.code === "23505"` was never matching on `mod_presets` (pre-existing) and would have on the new routes — patched all three to fall through to `err.cause?.code`.
- **9.2 MERGED** (9e30285). Migration 0009 adds `mod_presets.default_price numeric` nullable. Route + Zod accept the new field; `useModPresets()` hook returns full records alongside `useModPresetLabels()`. `<PresetsAdmin>` gained a `showPrice` prop that surfaces a "Default Price" column + price input on the add form; `ModPresetsAdmin` sets it. `InvoiceEditor` + `CreateInvoice` autofill `modification_price` when the user picks a preset description — only when the price input is `''` or `0` so typed values aren't clobbered.
- **9.3 MERGED** (06fb5fd). `format.ts:buildLineGroups` parent-line description now reads `[Size] [Damage] [Unit#]` (joined live from inventory); legacy `invoice_notes` prefix is gone. New `buildContainerDesc()` helper handles missing size/damage gracefully. Per-container `Notes` input dropped from both `InvoiceEditor.tsx` and `CreateInvoice.tsx`. `sold.invoice_notes` column stays for backward-compat; client just stops writing/reading it. Followup commit `6a0240d` fixed a tsc-strict regression in the test (damage: null → '').
- **9.4 DONE (uncommitted).** User supplied 4 fixture images (`server/tests/fixtures/doors-{1..4}.jpg`) + ground truth (`doors.gt`). Of the 4, only `doors-4` (`SNPU600104-0`) was a real OCR fail — Textract returned the check digit as `O` instead of `0`; the other 3 were correctly extracted but the test was miscomparing on display-format hyphens. Fix: `extractFromBlocks` in `server/lib/textract.ts` now keeps a `LETTER_TO_DIGIT` substitution table (O/Q/D→0, I/L→1, Z→2, S→5, G→6, T→7, B→8) and treats digit-shaped letters as eligible in the serial + check-digit pools. The cross-product normalizes them to digits and ISO 6346 check-digit validation picks the winner. Single-token 11-char form generalized the same way. New script `server/scripts/capture-ocr-fixtures.ts` re-runs Textract and snapshots LINE blocks to `server/scripts/textract-fixtures/doors-N.lines.json` so the test runs offline. New regression test `server/tests/lib/textract.regression.test.ts` (4 cases) loads those snapshots; comparison is hyphen-insensitive since some DB rows store hyphenated display form. Existing 21 textract unit tests still pass.

Server suite 125 → 151; client 31 → 33.

**Working-tree (uncommitted on `2.0` 2026-05-18):**
- **9.4 OCR disambiguation** (see above).
- **Help page content.** `client/src/routes/Help.tsx` now has a section-card writeup of every major screen (Intake, Yard view, Inventory, Invoices, S&H invoices, Releases, Reports, Dashboard, Language) plus the Michelle contact block. CSS module gained card spacing. Inline English copy (admin/internal scope); the two existing i18n keys (`help.title`, `help.contact_heading`) stay.
- **Invoice tombstone on delete.** New behavior: `DELETE /api/v2/invoice/:id` keeps the invoice row, marks `deleted_at = NOW()`, clears `pdf_s3_key`, deletes invoice_containers, deletes sold rows, returns inventory to `available`. The invoice_number stays occupied so the YYYYMM sequence is contiguous and the operator sees the gap is intentional.
  - Migration `server/db/migrations/0010_invoice_tombstone.sql` adds `invoices.deleted_at timestamptz` nullable (already applied to local DB).
  - `server/lib/invoice-ops.ts:deleteInvoiceCascade` rewritten.
  - GET routes use `LEFT JOIN invoice_containers` so tombstones appear in lists.
  - PUT, POST /:id/pdf, POST /:id/email all 409 on tombstoned invoices.
  - Client `InvoiceData` gains `deleted_at: string | null`. `InvoicesGrid` shows a `Deleted` danger badge + striped tile background. `InvoiceDetail` renders a tombstone notice and hides Edit/Regen/Email/Delete actions when deleted.
  - 1 existing test updated (`deleteInvoiceCascade` now asserts row remains, `deleted_at` set, pdf_s3_key null, container links gone) + 1 new test ("sequence stays contiguous after tombstone"). S3 PDF objects orphan — cheap, sweep follow-up if storage cost matters.

**Decisions made 2026-05-18:**
- **A80 thermal printer = wrong hardware.** FCC ID `2A6FW-A80` resolves to Xiamen Print Future Technology's "A80 portable A4 thermal printer" — a 216mm-wide A4 mobile document printer, not a POS receipt printer. No 80mm receipt paper, no advertised ESC/POS, no published web SDK. Spec sheet: https://www.futureprt.com/products_details/138.html. Phase 7 needs either a hardware swap to a real ESC/POS receipt printer (Epson TM-m30III, Star mC-Print3, or rugged-Android-paired Bluetooth thermal) OR a redesign of "driver receipt" to fit A4 letter format.
- **Web Bluetooth = hard blocker on iPad.** Safari/WebKit has zero Web Bluetooth support and no signal it's coming. From an iPad PWA, pairing *any* Bluetooth thermal printer is effectively impossible without a third-party browser shim (Bluefy/WebBLE) that the operator would resent every shift. Network-attached ESC/POS receipt printer (Epson TM-m30III LAN) is viable from iPad; Bluetooth is not.
- **Hardware path forward (recommended):** keep the iPad as office/admin device; buy a sub-$500 rugged Android (CAT S75, Ulefone Armor 24) for yard use; pair with a 80mm Bluetooth ESC/POS receipt printer (or upgrade iPad → network ESC/POS if a wired LAN drop exists at the gate). PWA itself needs no migration to run on Android Chrome — it's just a browser.

**Next** (need user direction):
- Phase 8 (QuickBooks integration) — deferred per user.
- Spanish translation review — deferred per user.
- Staging environment before the `2.0` → `main` cutover is still unscheduled.

**Triple-channel driver receipt — direction locked 2026-05-18.** Email + SMS + AirPrint, all three channels, single "Send to driver" action on delivery-sheet ReportDetail. Plan landed in [PLAN.md §7 + §7 Phase 9 PR 9.6–9.8](PLAN.md) on 2026-05-18. **PR 9.6 merged 2026-05-18** (`43f9fc2`). Twilio config + 10DLC approval are the only thing blocking live SMS delivery — code is in place, returns 503 with a clear message until env vars are set.

- **Hardware path:** original A80 is the wrong product (FCC ID `2A6FW-A80` = Xiamen Print Future A4 portable, not 80mm POS). Replacement: **Star TSP654II AirPrint-24** (part `39481870`; new ~$440 from Beagle Hardware, used refurb ~$190 on eBay) + **GL.iNet GL-MT300N-V2 Mango** ($30 from gl-inet.com) as a local-WiFi-only bridge. iPad keeps cellular for internet; AirPrint runs over the local LAN only. Faraday-cage caveat: router has to be where the iPad and printer both live at print time — steel walls block WiFi cleanly.
- **Software PRs (Phase 9 follow-on, can stack independently):**
  - **9.6 MERGED** (`43f9fc2`). Twilio SMS + public `/r/:token` route + driver-contact step + Send-to-Driver modal. Server 151 → 163 tests. SMS body is PII-free, each send mints a fresh 128-bit token with 30-day expiry + manual revoke. Cred env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`; `PUBLIC_BASE_URL` defaults to `https://airtightshippingcontainer.com`. Returns 503 "not configured" until env is set — rest of system unaffected.
  - **9.7 MERGED** (`dbb7872`). Outbound state-flip from `delivery_sheet.delivery_date`. Eager hook on POST `/api/v2/report` + POST `/:id/regenerate`, daily cron at 05:00 ET, one-shot backfill in migration `0013`. One-way (outbound stays outbound), idempotent, sales-only. Side-effect: keeps `sold.outbound_date` synced for the legacy `/api/v1/inventory` join. Server 163 → 172 tests. Cron toggle: `OUTBOUND_FLIP_CRON=off` in dev/CI. **Closes the "Mark Outbound is gone" gap from Phase 4** — no UI button needed; the delivery-sheet date is the trigger.
  - **9.8 MERGED** (`60c5e7e`). AirPrint print channel. New `DeliveryReceiptTemplate` (80mm thermal layout — single column, 72mm content width, system fonts, dashed-rule dividers, monospace unit#). New `/reports/:id/print` route renders the template standalone, strips app chrome via body-class swap, auto-fires `window.print()` after a 250ms settle. ReportDetail (delivery_sheet only) gains "Print receipt" button that opens that route in a new tab → iPad Safari shows AirPrint picker → paper drops. No server changes. **Smoke deferred** until hardware lands; layout may need 80mm-paper tweaks after first physical print.

**What's needed from operator to flip SMS live (code is merged):**
- ✅ Twilio account — done, brand `Airtight Container` registered as sole-prop 2026-05-18.
- ✅ Phone number — done.
- ✅ Messaging Service SID — done (`MGde4ad37ed70fb2bd1bd9330c009ced23`).
- ⏳ A2P 10DLC campaign approval — submitted 2026-05-18, awaiting carrier review (1–3 business days typical).
- ⏳ Drop creds into `server/.env` (local) + `~/airtight-container/.env` (EC2): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` (preferred for A2P; falls back to `TWILIO_FROM_NUMBER`). `PUBLIC_BASE_URL` defaults to `https://airtightshippingcontainer.com`; override if the prod host changes.
- ⏳ While trial mode is active (until 10DLC clears): verify your personal phone (and any test recipient) in the Twilio console (Console → Phone Numbers → Verified Caller IDs) so dev/smoke can deliver to real handsets.

**What's needed from operator to smoke 9.8 once hardware arrives:**
- Plug Mango into wall outlet (USB). Leave WAN port empty.
- Plug Star printer into a Mango LAN port via short ethernet cable.
- Run outdoor CAT6 from a Mango LAN port → through a vent → to the pole-mounted U6-Mesh outside.
- PoE injector sits inline between Mango LAN and the outdoor cable (included with the U6-Mesh bundle SKU).
- iPad joins the U6-Mesh's WiFi (any SSID name; the Mango admin UI at `192.168.8.1` lets you pick). Accept the "no internet" warning, enable Auto-Join.
- From ReportDetail on a delivery_sheet, hit **Print receipt** → new tab opens → AirPrint picker should list the Star printer → confirm → paper drops.
- If layout doesn't fit the 80mm paper (text wraps, content overflows), poke me — `client/src/components/templates/delivery-receipt/DeliveryReceiptTemplate.module.css` is the one file to tweak.

**Hardware ordered 2026-05-18:**
- Star TSP654II AirPrint-24 (eBay refurb $190 + PS60A PSU ~$40)
- GL.iNet Mango (GL-MT300N-V2) $28
- Ubiquiti UniFi U6-Mesh (PoE injector included SKU `B09YRZYB29`) $200
- RiteAV Cat6 25ft Outdoor Direct Burial Pure Copper $25
- 80mm thermal paper, 50-roll case $35
- Amazon Basics 12W USB wall plug $8

**Unblocked if user is busy:**
- Spanish translation review using a service (DeepL / Google Translate) as a second-pass refinement.
- Historical re-render bulk run — `server/scripts/rerender-all-invoices.ts` is ready (`--dry-run` → `--limit 5` → full).
- ~~UI-level tests for InvoicesGrid + InvoiceEditor~~ — **DONE** 2026-05-18 (`0c9a1c7`). Client suite 33 → 52. Covers tile rendering, search-narrows-tiles-and-sidebar, active-client snap-back, deleted-tile badge, pagination thresholds, mod reorder/add/remove, totals-preview live recompute, save/cancel callbacks. Pattern for future component tests is in place.
- Dashboard P&L refinements — year-over-year overlay on trend chart; container-size filter; top-clients drill-down (click bar → that client's invoices).

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
- **Delivery template is letter-only.** The Phase 5 DeliveryTemplate is the 8.5x11 customer-facing artifact (signed at handover, kept by customer). The A80 thermal printer (Phase 7) gets a *separate* small-format slip — to be designed when the A80 spec sheet conversation happens. Don't try to make the letter template responsive-collapse to 80mm; it sacrifices the brand fidelity that's the whole point of this phase. PLAN §7 Phase 7 already specs the driver-receipt slip as a separate doc; that's the home for thermal.

### Phase 4 design decisions (locked 2026-05-14)

- **Inventory split:** three tabs — `available` / `pending` / `sold`. Hold rows nest inside `available` with a "Held" badge; `outbound` nests inside `sold` with an "Outbound" badge until Phase 7's printer flow gives `outbound` its own state-flipping path.
- **Mark Outbound is gone.** PR 4.1 deleted `OutboundForm.jsx` + the drawer button. The driver-receipt print in Phase 7 will be what stamps `outbound_date` and flips state to `outbound`.
- **Search/sort:** header search box + per-column header-click sort. No sidebar facet.
- **Editor scope (PR 4.2):** unit#, size, damage, trucking_co, acq.price, notes editable. sale_company + release# read-only (reassignment via Releases page). Sold-row fields read-only with a deep link to /invoices/{n}. Photo strip = PhotoLightbox, read-only. Diff style = per-field background tint with old → new strip.
- **UI copy rule (established mid-Phase-4):** user-facing strings must never reference Phase N / PR N / PLAN.md / branch names / commit shas. Comments in source are fine. See `feedback_ui_language_no_plan_refs.md` in user memory.
- **Yard view:** Units by Type on top, Releases below, S&H last. Per-state columns (Available/Hold = days onsite; Sold = outbound + release#). Outbound boxes don't appear in yard view (state filter is `=== 'sold'`, not `IN ('sold','outbound')` — different semantic than /inventory's Sold tab). Time format pinned to America/New_York via `Intl.DateTimeFormat`.

### Smoke caveat

Auth rate-limit is 20 req / 15 min on `/api/auth/*`. Heavy Playwright iteration burns through it fast; wait ~15min between aggressive smoke sessions or you'll start seeing 429s and the page kicks to `/auth`. The /intake page in Spanish has NOT been end-to-end smoked — when an i18n pass happens, first thing to verify is navigating /intake, toggling ES via the navbar pill, and walking both Sales and S&H paths to confirm no English leaks through. Same risk-area for PR 9.1's size/damage datalist: it's wired into both SalesDetailsStep + ShDetailsStep but only InventoryEditor was smoked end-to-end.

### Phase 5 design decisions locked during PR 5.3 (2026-05-14)

- **Pending-review S&H invoices count toward P&L revenue.** The month-end automation drafts them; operator reviews and ships. Accrual-style monthly reporting matches the business better than cash-style.
- **NULL acquisition_price → footnote.** P&L excludes those containers from cost and surfaces a "N containers excluded" footnote on the template so the operator knows the cost number is incomplete. (See `null_cost_count` on `PnLData`.)
- **In/Out includes both sales and S&H movements** but tags each row with `source` so the template renders sub-section headers under Inbound and Outbound.
- **Resolved data is snapshotted at create time** in `reports.resolved_data jsonb`. PDF re-renders, historical views, and the inline detail-page template all consume the snapshot, not live SQL. Re-resolve via the `POST /api/v2/report/:id/regenerate` endpoint when the operator fixes the underlying source rows. Migration 0006 added `resolved_data`, `pdf_generated_at`, `emailed_at`.
- **Separate SSR bundles**: `template-dist/` for invoices (untouched), `report-template-dist/` for the four report templates via a new dispatcher entry. `Dockerfile.backend` builds both in stage 1 and copies both into the runtime image.

### Phase 5 status

| PR | Contents |
|---|---|
| 5.1 | Schema + API plumbing for reports + mod_presets. Drizzle migration `0005_phase5_reports_modpresets.sql` creates the `reports` table (per PLAN §3.3) and the `mod_presets` table (id, label UNIQUE, position, created_at). FK from `reports.generated_by → user.id` ON DELETE SET NULL so report history survives a user delete. Migration is idempotent — re-applying on top of a stub table from an earlier drizzle-push tidies the duplicate FK and enforces NOT NULL on generated_at. Seeded mod_presets with the four entries from `client/src/components/forms/modificationPresets.ts`. Routes: `/api/v2/report` (GET list w/ ?report_type filter, GET :id, POST admin create + persist parameters jsonb, DELETE admin) — PDF rendering deferred to PR 5.2 once templates land; `pdf_s3_key` stays null until then. `/api/v2/mod-presets` (GET employee, POST/PUT/DELETE admin; 23505 unique-violations → 409 friendly). Validation: `createReportSchema` is a discriminatedUnion on report_type with per-type parameters shapes; modPresetSchema trims labels + bounds position. 11 + 9 new validation tests bring the server suite from 98 → 118. No client work yet — that starts in 5.2 with templates and 5.3 with the list + generator UI. |
| 5.2 | Brand-consistent report templates. New `client/src/components/templates/shared/` holds the brand atoms (`BrandSheet`, `BrandHeader`, `PartiesBlock`, `Divider`, `Banner`, `DocFooter`, `SectionTitle` + the `AIRTIGHT_PARTY` sender constant) backed by a single `sheet.module.css` that owns the Google Fonts `@import`, the paper-cream sheet, the slim header strip with logo + Archivo Black title + meta dl, the FROM/TO connector word, the inline banner, the bottom address footer, the base body-table styles, and the `@page` + structural `@media print` rules. `InvoiceTemplate.tsx` refactored to consume the shared atoms; its own module CSS shrinks to invoice-specific bits only (items table, summary block, terms, totals, grand-total) — visual parity verified, `.sheet` still resolves to IBM Plex Sans body + Archivo Black title on `#fdfcf8` cream. Four new templates land: `DeliveryTemplate` (per-container delivery sheet with Deliver-to banner, 4-up container strip, modifications table, notes block, two signature lines), `IOReportTemplate` (Inbound + Outbound stacked tables over a date window with count banners + empty-state copy), `PnLTemplate` (three summary cards with profit/loss tinting + Sales line table + S&H line table + grand net-profit row), `ShStatementTemplate` (per-client S&H over a date window with monthly activity table + tfoot column sums + right-aligned summary box). Preview route renamed: `/admin/invoice-templates` → `/admin/templates` (`TemplatesPreview.tsx` + `.module.css`), with a top dropdown that swaps between all five. Invoice + Delivery pull from real local-DB invoices; I/O, P&L, S&H Statement use synthesized fixtures (PR 5.3 will swap fixtures for server resolvers). No PDF endpoint or server data resolvers in this PR — both land in 5.3 alongside the user-facing /reports surface. |
| 5.3 | Server resolvers + PDF/email + UI. New `server/lib/report-resolvers/` package with one resolver per `report_type` (`delivery.ts`, `io.ts`, `pnl.ts`, `sh-statement.ts`) + an `index.ts` dispatcher and a shared `types.ts` mirroring the client template types. Each resolver hits the live DB via raw SQL and returns the typed data shape. Delivery handles the no-invoice fallback path (operator supplies `client_id`); In/Out includes S&H movements tagged with `source` for the template's delimiter; P&L pending-review S&H counts toward revenue, NULL acquisition_price counts get surfaced as `null_cost_count` footnote; S&H statement is per-client over an optional date window. Schema: migration `0006_phase5_reports_resolved_data.sql` adds `reports.resolved_data jsonb`, `reports.pdf_generated_at`, `reports.emailed_at`. `POST /api/v2/report` now runs the resolver inline, persists the resolved snapshot, and rolls the row back on resolver failure (returning a 400 with the resolver's message). New endpoints: `POST /:id/regenerate` (re-run resolver + bust cached PDF), `POST /:id/pdf` (Puppeteer render + S3 store), `GET /:id/pdf` (stream cached, lazy-render if missing), `POST /:id/email` (Resend with PDF attachment, BCCs the operator's logging addresses, merges recipients into `emailed_to`). PDF pipeline mirrors invoices but uses a separate `server/lib/report-pdf.ts` + a `report-templates.tsx` dispatcher bundle (`client/vite.config.report-templates.ts` → `server/report-template-dist/`) to keep the invoice bundle untouched. `Dockerfile.backend` builds both bundles. UI: `/reports` `ReportsGrid` (tile grid + sidebar facet by type, PDF/Sent badges), `/reports/new` type picker, `/reports/new/:type` per-type forms (`CreateReport.tsx` — delivery sheet container picker + full operator field set, I/O date range, P&L granularity/period, S&H client picker + window), `/reports/:id` `ReportDetail` (inline-rendered template via per-type component dispatch + Open PDF / Re-render PDF / Re-resolve data / Email… / Delete action bar). Retired: `Reports.jsx`, `Printout.jsx`, `templates/Delivery.jsx`, `reports/DeliverySheet.jsx`, `styles/reports.css`, and the `/reports/form` route. Server tests stay at 121 (3 new delivery_sheet validation tests landed earlier in the PR's schema-widening commit). End-to-end smoke verified against local DB: form → POST → resolver → row → inline template render. Puppeteer smoke (`server/scripts/smoke-report-pdf.ts`) writes letter-format PDFs to /tmp for all four types. Polish follow-ups landed on top: delivery sheet stepper + live preview (mirrors invoice flow); delivery sheet invariants (sold/outbound + S&H boxes only, conditional client_id fallback, native date/time pickers, modifications removed, one-page); receipt_note never defaults to invoice_notes; DELETE handler also clears the S3 PDF; CreateReport now supports S&H boxes via `sh_box_id` XOR `container_id` with branch-by-tag picker. |
| 5.4 | Dashboard P&L panel. New `PnLPanel.tsx` first/default tab on Dashboard with toolbar (granularity month/quarter/year + period picker, persisted in `localStorage('dashboard.pnl.selection')`). Summary cards: sales revenue / sales cost / net profit / S&H revenue. Drill-down tables under the cards. New `GET /api/v2/pnl?granularity=…&period=…` runs `resolvePnL` without persisting. "Generate PDF" button shells to `POST /api/v2/report` (pnl, current selection) and navigates to `/reports/:id`. Dashboard.jsx → Dashboard.tsx (lazy migration). |
| 5.5 | `release_summary` report type. Resolver `server/lib/report-resolvers/release-summary.ts` joins release_numbers → inventory → sold → invoice_containers → invoices → clients and returns quota/filled/remaining + per-container rows including `buyer_label`. Template `client/src/components/templates/release-summary/ReleaseSummaryTemplate.tsx` renders 3 summary cards (Filled / Remaining / Progress %) + a table with split Outbound and Buyer columns so buyer renders independently of outbound_date. `Releases.tsx` page reworked: Active/Filled tab toggle (filtered by `inventory_count < release_count` correlated subquery), "{filled} / {quota}" header with progress bar, per-release drawer with "In yard" inventory list + "Generate PDF report" CTA. Validation: `releaseSummaryParams` discriminated-union entry. Server suite 121 → 125. Direct follow-ups on `2.0`: native `confirm`/`prompt` replaced with styled Modal-based dialogs (`useConfirm`, `usePrompt` hooks + ConfirmProvider/PromptProvider in App.jsx); delete-report copy updated ("row and stored PDF will both be removed"); release-quota model fixed (drop intake decrement, auto-bump on overflow, migration `0007_release_count_quota_backfill.sql` conservatively clamps where filled > stored — does not over-restore mid-fill releases). |

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
- **Don't `git push` `2.0` to origin without an ask.** Local-only since PR 1.1; many commits ahead.
- **Don't backfill per-modification line items on legacy invoices.** Owner ruled it out; legacy stays single-line.
- **Don't translate admin flows.** Yard scope only (Intake, YardView, /help, Add A Box, navbar items the yard worker sees). Inventory / Invoices / Reports / Dashboard / Clients / Releases / Audit stay English.
- **Don't add new keys directly to `es.json`** without a matching English key — they'll never render. Add to both bundles together.

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

Nothing blocks the next pickup; the items below are pending owner decisions or schedulable when convenient.

- **40 orphan invoices with no `invoice_containers`** — flagged in PR 1.3 backfill. User to decide before prod cutover.
- **A80 thermal printer** spec — needed before Phase 7.
- **QuickBooks Online vs Desktop** — resolve before Phase 8.
- **Hardware swap** (iPad → rugged Android handheld) — raise inside printer convo.
- **S&H invoice email send** — see "follow-up items" above. Lacks a Puppeteer S&H template; the detail page is HTML-only right now.
- **Historical re-render bulk run** — script is ready (PR 3.8). User to schedule.
- **Spanish translation review** — first-pass `es.json` is machine-translated. Native review before prod.
- **Help page content** — stub shipped; real FAQs pending.
- **Staging environment** — none today. Probably worth standing up before `2.0` → `main` cutover.
- **Vite 8 / vitest 4 bumps** — dev-tooling-only esbuild advisories (GHSA-67mh-4wv8-2f99).
- **OCR regression sample set** — user reports Textract misreads (`0` ↔ `O` etc.) on some grimy container plates. Before opening PR 9.4, collect the failing raw Textract responses + source images into `server/scripts/textract-fixtures/` (gitignored) so the disambiguation pass has fixtures to lock against. Phase 9.4 is otherwise specced and ready to start.

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
- **Modification description input is `<input list="modification-presets">`** wherever per-mod line items exist (CreateInvoice Details step, InvoiceEditor). The shared datalist is now fed by `useModPresetLabels()` in `client/src/components/forms/modificationPresets.ts`, which fetches `/api/v2/mod-presets` and module-caches the result. Admin CRUD lives on the Dashboard "Modification Presets" tab; mutations publish back into the cache so the editor stays in sync.
- **i18n yard-only scope.** `i18next` + `react-i18next` mounted from `client/src/main.tsx`. Single `yard` namespace at `client/src/i18n/locales/{en,es}.json`. ALL yard-flow files (`Intake.tsx` + `intake/*` steps, `YardView.tsx`, `UpcomingOutbounds.tsx`, `ReleaseNumbers.jsx`, `ShYardSection.tsx`, navbar yard items, `Help.tsx`) pull strings via `t()`. Admin pages stay hard-coded English. Conditional translation strings (e.g. OCR feedback when size is missing) use narrower keys like `read_success_no_size` rather than rendering empty parens. Use `<Trans>` for any string with embedded markup (`<strong>` etc.). Navbar has the EN/ES segmented toggle next to the theme switch; selection persists in localStorage under `app.lang`.
- **Avatar/monogram pattern.** `client/src/components/UserAvatar.tsx` renders a circular monogram from the user's email initial with a palette-hashed background. Drop the legacy `profile.png` import — `UserAvatar` is the canonical avatar primitive.

---

## At end of session

Update this file in place. Note: what you finished, what's in flight, what's blocked, what the next session should pick up. Don't re-add the per-date session-notes pattern — that lives in `docs/session-notes/` as read-only history from the planning phase.
