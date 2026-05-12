# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## You are starting Phase 2

**Phase 2 — Intake flow + S&H domain.** Frontend-heavy this time, after Phase 1's near-pure backend work. The schema 2.0 substrate is already in place on the `2.0` branch (PRs 1.1 – 1.6 all merged via `--no-ff`).

### Do these things before you write any code

1. **Read [PLAN.md](PLAN.md) §4.1 + §4.2 (sales/S&H lifecycle), §4.5 (intake spec), §5 (UI rework summary), and §7 Phase 2 (scope + exit criteria).**
2. **Skim [server/db/schema.ts](../server/db/schema.ts)** for the actual 2.0 tables you'll be writing against (`inventory` + `sh_inventory` mostly, plus `release_numbers`, `release_number_containers`, `clients`, `sale_companies`).
3. **The local DB is already in schema-2.0 state** — every migration in [server/db/migrations/](../server/db/migrations/) has been applied locally. If you wipe and recreate, run `npm run db:migrate` from `server/` and then `npx tsx scripts/migrate-data-v2.ts --apply` to repopulate.
4. **Branch off `2.0`**, not `main`. Suggested first branch: `phase-2-intake-skeleton` or similar (dashed to match Phase 0 / Phase 1 convention since `phase-2` may exist as a leaf later).

### Open conversations to schedule before Phase 2 work goes deep

- **OCR field spec** — exact fields, regex/parsing rules, error tolerance. PLAN §1 lists this as a Phase 2 prep convo.
- **AWS S3 bucket setup** — bucket name(s), IAM credentials, env vars, region. Photos + invoice PDFs will share or split.
- **AWS Textract** — same setup. Region (Textract availability), credentials.
- **Intake animation polish** — references / inspiration the user has for the multi-step flow look-and-feel.
- **iPad target** — specific iPad model + iOS version for the yard usage; affects viewport/CSS testing targets.

### Recommended PR breakdown for Phase 2

A reasonable first split (refine after Phase 2 kickoff with the user):

1. **PR 2.1 — Intake flow skeleton.** Multi-step FlowStep primitive (add to `ui/`), navigation, no upload/OCR yet. Wire the Sales vs Storage branch.
2. **PR 2.2 — Sales intake details + submit-as-pending.** Replaces `/add`. Uses `is_pending_audit=true`. Old `/add` 301s.
3. **PR 2.3 — S&H domain wiring.** Routes for `sh_inventory`, lifecycle transitions, day counting (inclusive of arrival).
4. **PR 2.4 — S&H intake branch.** Client picker, rate confirm, submit-as-pending into `sh_inventory`.
5. **PR 2.5 — Pending-audit screen.** Admin-only, both Sales and S&H. Date override included.
6. **PR 2.6 — S3 photo upload + Textract OCR.** Backend signed-URL endpoint + frontend upload + Textract pipeline.
7. **PR 2.7 — Yard view S&H integration + navbar pending-action dropdown.**

### Don't

- **Don't touch Better Auth tables** (`user`, `session`, `account`, `verification`). Owned by Better Auth.
- **Don't run anything against prod.** Local DB only. Prod stays on legacy until the eventual `2.0` → `main` rollout.
- **Don't roll new UI primitives without asking.** Only `FlowStep` is a known new add for Phase 2.
- **Don't bypass lazy migration.** Convert `.jsx` → `.tsx` only as you touch a file for real work.
- **Don't `git push` `2.0` to origin without an ask.** It's been local-only since PR 1.1; the user is keeping it that way until the rewrite ships.

---

## Status after Phase 1

Phase 1 complete on `2.0` (local-only — not yet pushed). Six PR merge commits visible:

| Commit on `2.0` | PR | Contents |
|---|---|---|
| `ebf4e88` | 1.1 | Drizzle schema 2.0 + PLAN/HANDOFF doc fixes |
| `8365255` | 1.2 | Additive migration: new tables, columns, indexes, enums; type cleanups |
| `deeaca0` | 1.3 | Backfill script + address-review CSV; snapshot totals; dup-invoice cleanup |
| `6ad8c66` | 1.4 | Route ports to schema 2.0 (clients, client_id, acquisition_price) |
| `d70dce5` | 1.5 | `/clients` page (rolodex + create/edit modal, uses UI primitives) |
| `75360cc` | 1.6 | Cutover migration: DROP legacy tables, enforce NOT NULL FKs, UNIQUE on invoice_number |

`2.0` head is `75360cc`.

**Local DB state after PR 1.6:** schema-2.0 complete. `contacts` / `releases` / `users` tables gone. `inventory.acceptance_number` / `inventory.sale_company` text columns gone. `inventory.release_number_id` / `sale_company_id` NOT NULL. `invoices.invoice_number` UNIQUE. Row counts: 656 inventory, 238 invoices (post dup-cleanup), 437 sold, 150 clients, 280 release_numbers (143 original + 137 placeholders from PR 1.3 step 3a/3b).

**Verified at Phase 1 close:** server boots, server vitest 8/8 pass, client builds 86.80 KB gz, `/api/v2/invoice/latest` returns 200. Backups for each PR are in `/tmp/airtight-backups/pre-pr1{2,3,4,6}-*.dump` if you need to roll back locally.

Stack you're inheriting: Vite + TypeScript on the client, Express 4 + tsx + Drizzle ORM on the server, Postgres system service with the full 2.0 schema (4 enums, 12 tables — clients, sale_companies, release_numbers, release_number_containers, inventory, sold, invoices, invoice_containers, sh_inventory, sh_invoices, sh_invoice_lines, reports). Better Auth (admin plugin, roles: pending/employee/admin), Resend for email, helmet + Zod for security/validation, Vitest + Playwright for tests, CSS Modules for new `ui/` primitives, csv-parse/csv-stringify as scripts-only deps.

---

## Open threads / blockers

None block Phase 2.

- **40 orphan invoices with no `invoice_containers`** — flagged in PR 1.3 backfill. Have customer + invoice_number + rate flags but no attached containers, so snapshot subtotal = 0. Pre-existing legacy data. User to decide whether to keep, clean up, or audit before prod cutover.
- **Legacy text columns dropped, transitional UI still has inputs** — `AddForm.jsx`/`UpdateForm.jsx` still expose `acceptance_number` and `sale_company` inputs. Backend now ignores those fields. UX is mildly broken (user can type and have value silently dropped). Phase 2's intake rewrite kills these forms entirely, which fixes it.
- **A80 thermal printer** (FCC ID `2A6FW-A80`) — spec sheet conversation needed before Phase 7.
- **QuickBooks Online vs Desktop** — resolve before Phase 8.
- **Hardware swap** (iPad → rugged Android handheld) — raise inside printer convo.
- **Three invoice template designs** — Phase 3 PR description.
- **Spanish translation source** — Phase 6 prep.
- **Help page content** — author vs draft. Phase 6 prep.
- **Staging environment** — none today. Probably worth standing up before the eventual `2.0` → `main` cutover.
- **Vite 8 / vitest 4 bumps** — close remaining dev-tooling-only esbuild advisories (GHSA-67mh-4wv8-2f99) when worth the breakage.
- **`docs/PLAN.md`** still has IDE auto-formatter whitespace tweaks uncommitted on the user's working tree (stashed at `stash@{0}` from PR 1.1 prep, if not already popped). User to decide.
- **Root `.gitignore`** EB-comment-line removal also in that stash. User to decide.

---

## Decisions worth remembering (since they're not obvious from the code)

- **In-place rewrite** with a single end-of-month-ish cutover when all phases are done. `2.0` stays local-only until then; prod runs legacy.
- **`contacts` → `clients` rename** complete, with split address, `business_name`, S&H rate defaults (`default_in_fee=65`, `default_out_fee=65`, `default_daily_rate=1`).
- **Storage & Handling is brand new** — separate tables (`sh_inventory`, `sh_invoices`, `sh_invoice_lines`). Boxes do not cross domains.
- **S&H billing** = cron-generated month-end → `pending_review` → admin reviews → admin clicks Send. Inclusive day counting.
- **Every container has a release_number FK** (NOT NULL, enforced as of PR 1.6 after PR 1.3's 297-row placeholder backfill).
- **Invoice totals snapshot** onto each invoice row (`subtotal`, `tax_rate`, `tax_amount`, `cc_fee_rate`, `cc_fee_amount`, `total`). Formula matches legacy `floor(parseInt(sale_price))+...` math so historical totals match what was printed.
- **Invoice numbers** stay `YYYYMM`+ 3-digit sequence; `UNIQUE` constraint enforced (PR 1.6). Server-side `pg_advisory_xact_lock` around generation lands in Phase 3 alongside the new create flow.
- **Sale-company normalization map** in `migrate-data-v2.ts` — 32 distinct legacy values collapse to existing 5 + 8 new vendors + Unknown fallback. User-confirmed 2026-05-12. Re-applied at eventual prod cutover.
- **Address splits** for 150 historical clients: CSV-edit workflow via `--emit-address-csv`. Local DB currently has auto-parsed addresses (mostly street only); user can re-edit the CSV and re-run `--apply` to UPSERT. Mandatory re-edit at prod cutover against fresh prod data.
- **Inventory release-when-empty semantics:** changed from DELETE to `UPDATE is_complete=true` (PR 1.4). Completed releases stay queryable but hidden from intake pickers.
- **Mobile + Spanish are yard-only.** Admin views stay desktop and English.
- **TypeScript everywhere** by end of Phase 5. Lazy migration, not big-bang.
- **PDFs in S3.** Invoices and saved reports. `pdf_s3_key` column populated in Phase 3 once the Puppeteer pipeline lands.
- **Component library** lives at `client/src/components/ui/` — Button, Modal, Badge, Toast. Phase 2 will add `FlowStep`.
- **`tsx`** is the prod runtime on the server. CSS Modules for new UI primitives; legacy global CSS stays until pages get refactored.
- **Phase 4 notes in user's auto-memory** refer to the *Better Auth migration's* Phase 4, NOT the PLAN.md phases. Different numbering.

---

## At end of session

Update this file in place. Note: what you finished, what's in flight, what's blocked, what the next session should pick up. Don't re-add the per-date session-notes pattern — that lives in `docs/session-notes/` as read-only history from the planning phase.
