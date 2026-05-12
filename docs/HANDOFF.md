# HANDOFF — live session-transition state

> **What this is:** the single rolling document that any agent reads before starting work. Update at the end of every working session. Replaces the per-session-notes pattern (those live in [session-notes/](session-notes/) as read-only history).
>
> **How to update:** edit in place. Don't accumulate timestamped sections — overwrite stale state. Keep this skim-length: under one page.

---

## Last updated

**2026-05-12** — Phase 0 complete and merged to `2.0` on origin.

## Current phase

**Phase 1 — Schema 2.0 + Clients page** is next. See [PLAN.md §7](PLAN.md#7-phased-pr-plan).

## Status

Branching model:
- `main` — deploy-on-push to EC2. Not touched in this work yet.
- `2.0` — long-lived integration branch for the rewrite. All Phase N work merges in here via per-PR feature branches. `2.0` merges to `main` only when the rewrite is ready to ship.
- `phase-0`, `phase-0-dep-audit` — kept as the source branches for the merged PRs. Can be deleted any time.

**Phase 0 PRs (all merged to `2.0` on origin):**

| Commit (on 2.0) | What |
|---|---|
| `34c635b` (merge of `a28701c`) | **PR 0.6** dep audit + slim: drop react-email family + 6.1MB of accidentally-committed Save-Page-As cruft. Client packages 231 → 121 (-47%). |
| `409dc7b` (merge of 7 commits) | **PRs 0.1–0.5** + workflow docs (CLAUDE.md, HANDOFF.md): Vite+TS, Drizzle+tsx, Vitest+Playwright, helmet+Zod, UI primitives (Button/Modal/Badge/Toast). |

**Verified end-to-end:** client builds in 735ms (84KB gz), server boots via tsx (105ms), **25 unit tests passing** (18 client + 7 server), Playwright config validates, Drizzle round-trips against live prod, helmet adds expected security headers.

Known remaining vulns (dev-tooling only, none in prod runtime):
- 5 moderate on client, 8 moderate on server — all the same esbuild dev-server CORS advisory (GHSA-67mh-4wv8-2f99) bubbling through vite/vitest/drizzle-kit. Fixing means major version bumps to vite 8 / vitest 4 — defer to a separate decision.

## What to start next session with

**Phase 1 kickoff** — schema 2.0 migrations + Clients page. The biggest single phase. Before designing the migration script, run the preflight queries against prod:

```sql
SELECT count(*) FROM inventory WHERE aquisition_price IS NULL;
SELECT count(*) FROM sold WHERE modification_price = 0;
```

Then we step through:
1. Drizzle schema rewrite (everything in [PLAN.md §3](PLAN.md#3-schema-20))
2. `scripts/migrate-data-v2.ts` with the seven backfill steps
3. New `/clients` page (rolodex + edit/create + S&H rate defaults)
4. Port existing routes to Drizzle + the renamed `clients` table
5. Cutover plan rehearsal

Phase 1 branches off `2.0` (e.g. `phase-1/schema-2.0`).

## Open threads / blockers

Same as last session — none block earlier phases:

- **A80 thermal printer** (FCC ID `2A6FW-A80`) — need spec sheet. Convo before Phase 7.
- **QuickBooks Online vs Desktop** — resolve before Phase 8.
- **Hardware swap** (iPad → rugged Android handheld) — raise inside printer convo.
- **OCR field spec** — confer at Phase 2 kickoff.
- **Three invoice template designs** — to be pitched in Phase 3 PR.
- **Spanish translation source** — Phase 6 prep.
- **Help page content** — author vs draft. Phase 6 prep.
- **Staging environment** — none today. Worth a dry-run env for Phase 1 cutover weekend?
- **Historical invoice re-render** — currently in Phase 3, easy to move to Phase 1 cutover.
- **Vite 8 / vitest 4 bumps** to close the dev-server esbuild advisories — separate conversation when worth the breakage.
- **`docs/PLAN.md`** has IDE auto-formatter whitespace tweaks still uncommitted. User to decide.
- **Root `.gitignore`** comment-line removal still uncommitted. User to decide.

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
- **Component library** lives at `client/src/components/ui/`. Add primitives there as their consumers get built.
- **Drizzle schema definitions** at `server/db/schema.ts` mirror *current* prod, not 2.0. The 2.0 schema rewrite happens in Phase 1.
- **`tsx` as the prod runtime on the server** — chosen for simplicity over a tsc build step. Easy to swap if startup latency ever matters.
- **CSS Modules** for new UI primitives. Legacy global CSS in `src/styles/` until pages get refactored.
