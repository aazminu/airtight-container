# HANDOFF — live session-transition state

> **What this is:** the single rolling document that any agent reads before starting work. Update at the end of every working session. Replaces the per-session-notes pattern (those live in [session-notes/](session-notes/) as read-only history).
>
> **How to update:** edit in place. Don't accumulate timestamped sections — overwrite stale state. Keep this skim-length: under one page.

---

## Last updated

**2026-05-12** — end of planning, about to start implementation.

## Current phase

**Phase 0 — Foundation.** Not yet started. See [PLAN.md §7](PLAN.md#7-phased-pr-plan) for the full phase breakdown.

## Status

Planning is **complete**. [PLAN.md](PLAN.md) is the source of truth: scope, stack, full schema 2.0 punch list, S&H domain model, eight-phase staged PR plan, security pass, deferred items, and explicit non-goals.

Last commit: `454f689 2.0 plan phase in progress` (planning docs only).

The `.gitignore` has one uncommitted modification (a stray comment-line removal) — left for the user to decide on.

## What to start next session with

1. **Decide:** kick off Phase 0, or one more planning pass? If kicking off, the work is:
   - Migrate CRA → Vite, set up TypeScript scaffolding (lazy `.jsx` → `.tsx` migration as files are touched)
   - Add Drizzle + drizzle-kit; introspect the existing prod schema as the starting point
   - Add Vitest + Playwright with one canary test each
   - Build shared component primitives (`DataTable`, `FlowStep`, `Modal`, `FormField`, `SearchableSelect`, `Badge`, `Toast`) — see [PLAN.md §5](PLAN.md#5-ui-rework-summary)
   - Dep audit: remove `web-vitals`, `react-scripts`, CRA-specific test deps; re-justify everything else
   - Add `helmet` + Zod scaffolding on the server
   - Exit criteria: app builds and runs identically on Vite, all feature pages unchanged, test commands work
2. **Run preflight queries against prod** before Phase 1 design firms up:
   - `SELECT count(*) FROM inventory WHERE aquisition_price IS NULL;` (affects historical P&L coverage)
   - `SELECT count(*) FROM sold WHERE modification_price = 0;` (sanity check on mod-work coverage)

## Open threads / blockers

These don't block earlier phases but should be resolved before the phase that depends on them:

- **A80 thermal printer** (FCC ID `2A6FW-A80`) — need spec sheet / photos. Convo before Phase 7.
- **QuickBooks Online vs Desktop** — user leaning Desktop, marked TBD. Desktop is meaningfully harder (no first-party REST). Resolve before Phase 8.
- **Hardware swap** (iPad → rugged Android handheld with built-in printer, e.g. Sunmi V2/V3, Zebra TC-series) — to be raised inside the printer convo.
- **OCR field spec** — confer at Phase 2 kickoff (which decal fields to parse, regex rules, error tolerance).
- **Three invoice template designs** — to be pitched in the Phase 3 PR description.
- **Spanish translation source** — human translator or DeepL? Phase 6 prep.
- **Help page content** — user authors, or agent drafts for review? Phase 6 prep.
- **Staging environment** — none today; deploys go straight to prod. Worth a dry-run env for the Phase 1 cutover weekend? User to flag.
- **Historical invoice re-render timing** — currently scheduled for Phase 3 (after PDF pipeline exists) rather than Phase 1 cutover. Snapshot totals still happen at cutover. Easy to flip if user prefers frontloading.

## Decisions worth remembering (since they're not obvious from the code)

- **In-place rewrite** with a weekend-tolerable cutover. Drizzle migrations + a one-shot data transformation script (`scripts/migrate-data-v2.ts`) run during cutover.
- **`contacts` → `clients` rename** with split address fields (`street`, `city`, `state`, `zip`), new `business_name`, and S&H rate defaults (`default_in_fee=65`, `default_out_fee=65`, `default_daily_rate=1`).
- **Storage & Handling is brand new** — completely separate tables (`sh_inventory`, `sh_invoices`, `sh_invoice_lines`) from sales. Boxes do not cross domains.
- **S&H billing** = cron-generated on last day of month in `pending_review` status → admin reviews → admin clicks Send. Day counting is **inclusive** of arrival day.
- **Every container always has a release_number FK** (NOT NULL, enforced at DB level after a one-time backfill of the single legacy NULL row).
- **Invoice totals snapshot** onto each invoice row (`subtotal`, `tax_rate`, `tax_amount`, `cc_fee_rate`, `cc_fee_amount`, `total`) so historical totals never drift if rates change.
- **Invoice numbers** stay `YYYYMM` + 3-digit sequence; concurrency fixed via server-side `pg_advisory_xact_lock` + `UNIQUE` constraint.
- **Mobile + Spanish are yard-only.** Admin views stay desktop and English.
- **TypeScript everywhere** by end of Phase 5. Lazy migration, not big-bang.
- **PDFs in S3.** Invoices and saved reports both. Consistency is enforced by storing `pdf_s3_key` alongside structured rows.
