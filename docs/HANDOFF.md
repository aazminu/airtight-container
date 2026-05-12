# HANDOFF — live session-transition state

> **What this is:** the single rolling document that any agent reads before starting work. Update at the end of every working session. Replaces the per-session-notes pattern (those live in [session-notes/](session-notes/) as read-only history).
>
> **How to update:** edit in place. Don't accumulate timestamped sections — overwrite stale state. Keep this skim-length: under one page.

---

## Last updated

**2026-05-12** — Phase 0 complete locally, awaiting review/push.

## Current phase

**Phase 0 — Foundation.** All five planned PRs implemented as commits on branch `phase-0/drizzle-setup`. Branch is not yet pushed.

## Status

Branch `phase-0/drizzle-setup` (six commits ahead of main):

| Commit | What |
|---|---|
| `42d226a` | Add CLAUDE.md and docs/HANDOFF.md (workflow infra) + remove committed CRA `build/` tree |
| `88b27fe` | **PR 0.2** Drizzle ORM, TypeScript, tsx runtime; POC port of `GET /api/v1/inventory` |
| `e828ce2` | **PR 0.1** CRA → Vite + TypeScript migration |
| `d76dbc6` | **PR 0.3** Vitest + Playwright scaffolding with canary tests |
| `240b8e5` | **PR 0.4** helmet + Zod scaffolding + POC validation on `POST /api/v2/contact` |
| `50351a1` | **PR 0.5** Shared UI primitives: Button, Modal, Badge, Toast (+18 unit tests) |

Commit order on the branch is non-chronological because PR 0.1 was cherry-picked on top of PR 0.2 to consolidate Phase 0 onto a single branch. Functionally fine; each PR is independent.

**Verified end-to-end:** client builds (1.16s, 84KB gz), server boots via tsx (105ms), client vitest 18/18, server vitest 7/7, Playwright config validates, Drizzle round-trips against live prod, helmet adds expected security headers.

## What to start next session with

Pick one:

1. **Dep audit + slim micro-PR (optional Phase 0 closer).** Drop `react-email` + `@react-email/*` from client deps (transitively pulls in CVE-2025-66478-vulnerable Next.js 15.1.2; only used by the commented-out `IOReport.jsx`). Server has 4 moderate vulnerabilities to investigate. Will need user input on whether to keep `react-email` for future email templates.
2. **Push and split into PRs.** Push `phase-0/drizzle-setup` and open as either one PR or five (`git cherry-pick` the commits onto fresh branches off main).
3. **Start Phase 1 — Schema 2.0 + Clients page.** The biggest single phase: drizzle migrations for all schema renames/restructures in [PLAN.md §3](PLAN.md#3-schema-20), `scripts/migrate-data-v2.ts` with the seven backfill steps, new Clients page replacing the legacy contacts flow. Run preflight prod queries first (see [PLAN.md §8](PLAN.md#8-open-follow-ups-for-implementation-time)).

Recommended order: 1 → 2 → 3.

## Open threads / blockers

Same as last session — none of these block earlier phases:

- **A80 thermal printer** (FCC ID `2A6FW-A80`) — need spec sheet. Convo before Phase 7.
- **QuickBooks Online vs Desktop** — Desktop is harder. Resolve before Phase 8.
- **Hardware swap** (iPad → rugged Android handheld) — raise inside printer convo.
- **OCR field spec** — confer at Phase 2 kickoff.
- **Three invoice template designs** — to be pitched in Phase 3 PR.
- **Spanish translation source** — Phase 6 prep.
- **Help page content** — author vs draft. Phase 6 prep.
- **Staging environment** — none today. Worth a dry-run env for Phase 1 cutover weekend?
- **Historical invoice re-render** — currently in Phase 3, easy to move to Phase 1 cutover if preferred.

New, opened by Phase 0:

- **Branching policy** — Phase 0 landed as one branch with five commits, not five branches. User can choose: PR-per-commit (split via cherry-pick) or one umbrella PR. Recommend the umbrella for Phase 0; per-PR-branch for later phases that touch more files.
- **`tsx` as the prod runtime on the server** — chosen for simplicity over a tsc build step. Acceptable cold-start cost. Easy to swap to compiled output if startup latency ever matters.
- **CSS Modules as the styling approach** — chosen for the new `ui/` primitives. Existing pages keep their global CSS in `src/styles/` until refactored.
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
- **Component library** (Phase 0 PR 5) lives at `client/src/components/ui/`. Add primitives there as their consumers get built. Existing `components/{forms,lists,reports,rows,templates}/` directories stay for legacy code until those pages get refactored in their phases.
- **Drizzle schema definitions** at `server/db/schema.ts` mirror *current* prod, not 2.0. New tables get added here only as routes are ported. The 2.0 schema rewrite happens in Phase 1.
