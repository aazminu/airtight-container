# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## You are starting Phase 1

**Phase 1 — Schema 2.0 + Clients page.** The biggest phase of the rewrite. This is mostly backend and database work.

### Do these things before you write any code

1. **Read [PLAN.md](PLAN.md) end-to-end**, especially §3 (Schema 2.0 — the rename table, new columns, new tables, drops, the seven backfill steps, new constraints/indexes), §4.4 (Clients model), and §7 Phase 1 (scope + exit criteria).
2. **Read [docs/schema.psql](schema.psql)** so you know exactly what's in prod today.
3. **Run the two preflight queries against the local Postgres** (the local DB is a prod mirror; connection string in `server/.env`):
   ```sql
   SELECT count(*) FROM inventory WHERE aquisition_price IS NULL;
   SELECT count(*) FROM sold WHERE modification_price = 0;
   ```
   The results affect how the migration script handles defaults for historical rows. Surface the numbers to the user before designing the script.
4. **Branch off `2.0`**, not `main`. Suggested first branch: `phase-1/schema-2.0`.

### Recommended PR breakdown for Phase 1

Don't land all of Phase 1 in one PR — it's too big to review. Suggested split (the user prefers staged PRs):

1. **PR 1.1 — Drizzle schema definitions for 2.0.** Write the new TS schema in `server/db/schema.ts` covering every table in PLAN.md §3 (renames, new columns, new tables). No SQL migrations yet, no data changes. Just the source of truth.
2. **PR 1.2 — Additive migration.** `drizzle-kit generate` to create the SQL that *adds* new columns, new tables, new indexes — but doesn't drop anything legacy yet and doesn't enforce new NOT NULL FKs. Reversible.
3. **PR 1.3 — Backfill script.** `scripts/migrate-data-v2.ts` implementing the seven steps in PLAN.md §3.5. Runs on a copy of the local DB; surface counts and any rows that don't parse cleanly.
4. **PR 1.4 — Route ports.** Port existing routes to use the new schema names (especially `contacts` → `clients`). Lazy migration: keep .js routes as .js, import Drizzle from .ts. The `inventory` GET / port from PR 0.2 is the pattern.
5. **PR 1.5 — Clients page.** New `/clients` rolodex on the frontend. Uses the UI primitives in `client/src/components/ui/` — don't roll new ones.
6. **PR 1.6 — Cutover migration.** Drop legacy `releases` and `users` tables. Enforce new NOT NULL FKs (only safe after backfill ran). Pin invoice numbers UNIQUE. This is the irreversible step — pair with a fresh `pg_dump` backup.

Each PR off `2.0`, merged back with `--no-ff` to preserve boundaries.

### Things to ask the user about as they come up

- **Defaults for historical `sold` rows** on the new `material_cost` / `labor_cost` columns — NULL or 0? My lean is NULL ("we don't know" is honest), but ask.
- **Address-split heuristic** for `contacts.contact_address` — the current logic is "split on first comma." For the 150 historical contacts, some won't parse cleanly. Surface the unparseable rows for manual review before cutover; don't guess.
- **Whether historical invoice re-render belongs in Phase 1 or Phase 3.** Currently scheduled for Phase 3 (after PDF pipeline exists), but snapshot totals must go in at Phase 1 cutover. User said this is flippable.
- **Cutover timing.** User can tolerate up to a weekend of downtime. Don't propose a cutover plan without confirming the window.

### Don't

- **Don't touch Better Auth tables** (`user`, `session`, `account`, `verification`). They're managed by Better Auth itself.
- **Don't run anything against prod.** The local Postgres is the only DB you should query. Prod migration is a human-supervised event.
- **Don't roll new UI primitives.** Use what's in `client/src/components/ui/` (Button, Modal, Badge, Toast). If you need something else, ask the user first.
- **Don't bypass the lazy migration rule.** Convert `.js` → `.ts` only as you touch a file for real work, not just to "modernize."

---

## Status entering Phase 1

Phase 0 is fully merged to `2.0` on origin. Two merge commits visible in the graph:

| Commit on `2.0` | Phase 0 contents |
|---|---|
| `34c635b` | PR 0.6 — dep audit + slim (drop react-email, -6.1MB cruft, 231 → 121 client packages) |
| `409dc7b` | PRs 0.1-0.5 + workflow docs (Vite+TS, Drizzle+tsx, Vitest+Playwright, helmet+Zod, UI primitives) |

`2.0` head is `43e1179` (the HANDOFF update above the second merge).

**Verified end-to-end at Phase 0 close:** client builds in 735ms (84KB gz), server boots via tsx (105ms), 25 unit tests pass (18 client + 7 server), Playwright config validates, Drizzle round-trips against local Postgres, helmet adds expected security headers.

Stack you're inheriting: Vite + TypeScript on the client, Express 4 + tsx + Drizzle ORM on the server, Postgres system service, Better Auth (admin plugin, roles: pending/employee/admin), Resend for email, helmet + Zod for security/validation, Vitest + Playwright for tests, CSS Modules for the new `ui/` primitives.

---

## Open threads / blockers

None block Phase 1.

- **A80 thermal printer** (FCC ID `2A6FW-A80`) — need spec sheet. Convo before Phase 7.
- **QuickBooks Online vs Desktop** — resolve before Phase 8.
- **Hardware swap** (iPad → rugged Android handheld) — raise inside printer convo.
- **OCR field spec** — confer at Phase 2 kickoff.
- **Three invoice template designs** — to be pitched in Phase 3 PR.
- **Spanish translation source** — Phase 6 prep.
- **Help page content** — author vs draft. Phase 6 prep.
- **Staging environment** — none today. Worth asking the user if they want a dry-run env for the Phase 1 cutover weekend.
- **Vite 8 / vitest 4 bumps** to close remaining dev-tooling-only esbuild advisories (GHSA-67mh-4wv8-2f99) — separate conversation when worth the breakage.
- **`docs/PLAN.md`** has IDE auto-formatter whitespace tweaks uncommitted. User to decide.
- **Root `.gitignore`** comment-line removal uncommitted. User to decide.

---

## Decisions worth remembering (since they're not obvious from the code)

- **In-place rewrite** with a weekend-tolerable cutover. Drizzle migrations + a one-shot data transformation script run during cutover.
- **`contacts` → `clients` rename** with split address (`street`, `city`, `state`, `zip`), new `business_name`, and S&H rate defaults (`default_in_fee=65`, `default_out_fee=65`, `default_daily_rate=1`).
- **Storage & Handling is brand new** — completely separate tables (`sh_inventory`, `sh_invoices`, `sh_invoice_lines`). Boxes do not cross domains.
- **S&H billing** = cron-generated on the last day of each month in `pending_review` → admin reviews → admin clicks Send. Day counting is **inclusive** of arrival day.
- **Every container always has a release_number FK** (NOT NULL, enforced at the DB level after a one-time backfill of the single legacy NULL row).
- **Invoice totals snapshot** onto each invoice row (`subtotal`, `tax_rate`, `tax_amount`, `cc_fee_rate`, `cc_fee_amount`, `total`) so historical totals never drift if rates change.
- **Invoice numbers** stay `YYYYMM` + 3-digit sequence; concurrency fixed via server-side `pg_advisory_xact_lock` + `UNIQUE` constraint.
- **Mobile + Spanish are yard-only.** Admin views stay desktop and English.
- **TypeScript everywhere** by end of Phase 5. Lazy migration, not big-bang.
- **PDFs in S3.** Invoices and saved reports both. Consistency enforced by storing `pdf_s3_key` alongside structured rows.
- **Component library** lives at `client/src/components/ui/`. Add primitives there as their consumers get built.
- **Drizzle schema** at `server/db/schema.ts` currently mirrors *current* prod (just the `inventory` table for the PR 0.2 POC). Phase 1 PR 1.1 rewrites it to the 2.0 shape.
- **`tsx`** is the prod runtime on the server — chosen for simplicity over a tsc build step.
- **CSS Modules** for new UI; legacy global CSS in `src/styles/` stays until pages get refactored.
- **Phase 4 notes in user's auto-memory** refer to the *Better Auth migration's* Phase 4, NOT the PLAN.md phases. Different numbering.

---

## At end of session

Update this file in place. Note: what you finished, what's in flight, what's blocked, what the next session should pick up. Don't re-add the per-date session-notes pattern — that lives in `docs/session-notes/` as read-only history from the planning phase.
