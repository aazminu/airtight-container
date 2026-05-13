# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## You are starting Phase 3

**Phase 3 — Invoices rewrite + S&H invoicing.** Mixed backend + frontend, much heavier on the frontend than Phase 1 was and on the AWS pipeline than Phase 2 was. The intake + audit + S&H lifecycle substrate is now in place on `2.0` (PRs 2.1 – 2.8 all merged via `--no-ff`, plus three follow-ups).

### Do these things before you write any code

1. **Read [PLAN.md](PLAN.md) §3 (snapshot totals on invoices), §4.4 (S&H billing flow), §5 (UI rework — invoice template + tiled list + detail page), and §7 Phase 3 (scope + exit criteria).**
2. **Skim [server/db/schema.ts](../server/db/schema.ts)** for `invoices`, `invoice_containers`, `sh_invoices`, `sh_invoice_lines`, `reports`. All exist with the right shape after Phase 1.
3. **Look at the live invoice template** — `client/src/components/forms/InvoiceForm.jsx` (the giant template literal, NOT the `invoice.html` reference). Phase 3 PR 3.1 replaces it.
4. **Browser-test what Phase 2 left you:** sign in, hit `/intake`, run a Sales box and an S&H box end-to-end including the photo capture (real S3 + Textract are wired and verified). Hit `/audit` and exercise the inline forms. Hit `/yardview` and the new Storage section. Hit `/releases` and pre-load a container number, then run an intake matching it and confirm the row flipped to `is_used=true`.
5. **Branch off `2.0`**, not `main`. Suggested first branch: `phase-3-invoice-template` or similar (dashed convention).

### Open conversations to schedule before Phase 3 work goes deep

- **Three invoice template designs** — promised in PLAN.md as pitched in the PR 3.1 description.
- **Puppeteer in Docker** — runtime choice. Bundling chromium into the backend image bloats it; Puppeteer's Docker guidance covers this. Decide before PR 3.2.
- **Invoice PDF storage layout in S3** — already documented in [AWS_SETUP.md](AWS_SETUP.md) §1 (`invoices/<invoice_id>.pdf`, `sh-invoices/<sh_invoice_id>.pdf`). No new bucket setup needed — same bucket, same IAM user.
- **S&H month-end cron job** — where does it run? Options: a separate node-cron in the backend container, an external EventBridge → ECS Task, or just a manual `npm run` until volume justifies automation.
- **Historical re-render of 238 invoices through the new template** — opt-in batch script, run once on cutover weekend.
- **Tax rate dropdown defaults** — state list, or just NJ + NY + an "Other (type a rate)" entry?

### Recommended PR breakdown for Phase 3

(Refine with the user at Phase 3 kickoff. Three template designs come first since they're a blocking decision.)

1. **PR 3.1 — New invoice template.** Three designs pitched in the PR description, user picks one. Built as a React component (not a template literal). Drives both the on-screen Detail page AND the PDF generation.
2. **PR 3.2 — Puppeteer PDF pipeline.** Server-side render of the new template → PDF → S3 (`invoices/<id>.pdf`). `invoices.pdf_s3_key` populated on save. Backwards-compatible regeneration command for historicals.
3. **PR 3.3 — Tiled `/invoices` list + filter-by-client.** Replaces the legacy `InvoiceList.jsx`. Search moved into table header per PLAN §5.
4. **PR 3.4 — `/invoices/:id` detail page.** Read-only by default; admin-only edit / regenerate / email / delete. Email button reuses the existing `/api/v1/send` route (or a new `/api/v2/send` if we tighten it).
5. **PR 3.5 — Server-side invoice number sequencing.** `pg_advisory_xact_lock` around the `YYYYMM<seq>` insert. Phase 1 added the UNIQUE constraint; PR 3.5 enforces sequencing properly.
6. **PR 3.6 — S&H month-end pipeline.** Cron → generates `sh_invoices` rows with `status='pending_review'` + `sh_invoice_lines` (in_fee, out_fee, storage_days × per-day-by-rate per box). Counts days via the shared `countStorageDays` helper from PR 2.3.
7. **PR 3.7 — S&H invoice detail page.** Read-only with a Send button (admin-only). Navbar dropdown extended to surface pending S&H invoice counts.
8. **PR 3.8 — Historical re-render.** One-shot script that re-PDF's all 238 invoices through the new template, populates `pdf_s3_key`, verifies a sample manually before committing.

### Don't

- **Don't touch Better Auth tables** (`user`, `session`, `account`, `verification`). Owned by Better Auth.
- **Don't run anything against prod.** Local DB only. Prod stays on legacy until the eventual `2.0` → `main` rollout.
- **Don't change snapshot totals on existing invoices.** They're frozen at what was printed. Re-renders use the snapshot, not a re-derivation.
- **Don't bypass lazy migration.** Convert `.jsx` → `.tsx` only as you touch a file for real work.
- **Don't `git push` `2.0` to origin without an ask.** Local-only since PR 1.1; the user is keeping it that way until the rewrite ships.

---

## Status after Phase 2

Phase 2 complete on `2.0` (local-only — not yet pushed). Eight feature PRs + three follow-ups visible:

| Commit on `2.0` | PR | Contents |
|---|---|---|
| `1296190` | 2.1 | Intake flow skeleton + Flow primitive |
| `451f8e7` | 2.2 | Sales intake details + submit-as-pending; retire /add |
| `4818517` | 2.3 | S&H domain backend — routes, validation, day-counting |
| `e6cf4c7` | 2.4 | S&H intake branch — client picker + rate prefill + submit |
| `ebbe4e0` | 2.5 | Admin pending-audit screen — both Sales and S&H |
| `e4ba03b` | follow-up | Flow Fragment flattening fix + auto-reset intake on submit |
| `5588e3b` | 2.6 | S3 photo upload + Textract OCR end-to-end |
| `cb1521a` | follow-up | ISO 6346-aware unit-number extraction (cross-line, check-digit validation) |
| `fef7858` | 2.7 | Yard view S&H section + navbar pending-audit dropdown |
| `b1d10a0` | 2.8 | Release-number enumeration UX + intake auto-association |

`2.0` head is `b1d10a0`.

**Local DB state after Phase 2:** unchanged from end of Phase 1 except for migration 0003 (added `inventory.photos text[]`). All 67 server vitest cases pass; client builds clean (~330 KB JS / 56 KB CSS gzipped). AWS S3 + Textract verified end-to-end by the user (smoke scripts in `server/scripts/smoke-s3.ts` and `server/scripts/smoke-textract.ts`; bucket `airtight-container-prod-381491901964-us-east-1-an` in `us-east-1`).

**What's new in the user-facing app:**
- `/intake` is the new yard intake flow (Sales + Storage branches, photos, OCR, confirm, details, review). Old `/add` 301s here.
- `/audit` is the admin pending-audit screen — both Sales and S&H rows expand inline, photo strip per row.
- `/clients` (Phase 1) — rolodex + create/edit modal, S&H rate defaults.
- `/releases` is the new admin page for pre-loading container numbers per release. Intake auto-flips `is_used=true` server-side on match.
- Navbar Audit link is now a count-bearing dropdown.
- Yard view has a Storage section listing `in_storage` boxes with a days-onsite badge and an admin-only check-out shortcut.

**Open from Phase 2 that didn't ship:**
- **Spanish localization for yard flows** is deferred to Phase 6 per the original plan.
- **iPad-specific compliance audit** of `/intake` + `/yardview` deferred to Phase 6 polish.
- **Animation polish** — the Flow primitive is functional but the transitions are simple fade+shift; the "more elaborate" pitch deck the user mentioned was deferred.

---

## Open threads / blockers

None block Phase 3.

- **40 orphan invoices with no `invoice_containers`** — same as end-of-Phase 1. Flagged in PR 1.3 backfill. User to decide before prod cutover.
- **A80 thermal printer** (FCC ID `2A6FW-A80`) — spec sheet conversation needed before Phase 7.
- **QuickBooks Online vs Desktop** — resolve before Phase 8.
- **Hardware swap** (iPad → rugged Android handheld) — raise inside printer convo.
- **Three invoice template designs** — Phase 3 PR description, blocking PR 3.1.
- **Puppeteer in Docker** — runtime choice, blocking PR 3.2.
- **Spanish translation source** — Phase 6 prep.
- **Help page content** — author vs draft. Phase 6 prep.
- **Staging environment** — none today. Probably worth standing up before the eventual `2.0` → `main` cutover.
- **Vite 8 / vitest 4 bumps** — close remaining dev-tooling-only esbuild advisories (GHSA-67mh-4wv8-2f99) when worth the breakage.
- **`docs/PLAN.md`** stash from PR 1.1 prep (IDE whitespace tweaks) may or may not still exist locally. User to decide.

---

## Decisions worth remembering (since they're not obvious from the code)

(Carried forward from Phase 1 + added during Phase 2.)

- **Site domain split:** customer-facing site is **airtightshippingcontainer.com** (www + apex). Business mail + invoicing identity intentionally stayed at **airtightstorage.com** / "Airtight Storage Systems Inc". Anything customer-facing (CORS, OAuth redirects, links) uses the new domain; `from:` headers + invoice template use the old.
- **In-place rewrite** with a single end-of-month-ish cutover when all phases are done. `2.0` stays local-only until then; prod runs legacy.
- **`contacts` → `clients` rename** complete, with split address, `business_name`, S&H rate defaults (`default_in_fee=65`, `default_out_fee=65`, `default_daily_rate=1`).
- **Storage & Handling is brand new** — separate tables (`sh_inventory`, `sh_invoices`, `sh_invoice_lines`). Boxes do not cross domains.
- **S&H billing** = cron-generated month-end → `pending_review` → admin reviews → admin clicks Send. Inclusive day counting (`countStorageDays` / `storageDaysForMonth` in `server/lib/sh.ts`).
- **Every container has a release_number FK** (NOT NULL, enforced as of PR 1.6).
- **Release-number enumeration:** admin pre-loads container numbers per release at `/releases`; intake auto-flips `is_used=true` on match. Optional — releases without pre-loaded containers still work fine.
- **Invoice totals snapshot** onto each invoice row. Formula matches legacy `floor(parseInt(sale_price))+...` math so historical totals match what was printed.
- **Invoice numbers** stay `YYYYMM`+ 3-digit sequence; `UNIQUE` constraint enforced (PR 1.6). Server-side `pg_advisory_xact_lock` around generation lands in PR 3.5.
- **Sale-company normalization map** in `migrate-data-v2.ts`. User-confirmed 2026-05-12. Re-applied at eventual prod cutover.
- **Address splits** for 150 historical clients: CSV-edit workflow via `--emit-address-csv` / `--apply`. Mandatory re-edit at prod cutover against fresh prod data.
- **Inventory release-when-empty semantics:** changed from DELETE to `UPDATE is_complete=true` (PR 1.4). Completed releases stay queryable but hidden from intake pickers.
- **Mobile + Spanish are yard-only.** Admin views stay desktop and English.
- **TypeScript everywhere** by end of Phase 5. Lazy migration, not big-bang.
- **PDFs in S3.** Invoices and saved reports. `pdf_s3_key` column populated in Phase 3 once the Puppeteer pipeline lands.
- **Component library** lives at `client/src/components/ui/` — Button, Modal, Badge, Toast, Flow.
- **OCR field spec** — Textract pulls `unit_number` only; size / damage / acquisition_price are typed manually on the Details step. Cross-line + ISO 6346 check-digit-validated extraction (see `server/lib/textract.ts`).
- **Photo capture spec** — one required photo of the **doors** (canonical OCR target per ISO 6346) plus 0-N optional extras.
- **Pre-signed S3 URLs** for both PUT (5-min TTL, iPad upload) and GET (1-hour TTL, audit screen display). Server signs locally — costs nothing.
- **`tsx`** is the prod runtime on the server. CSS Modules for new UI primitives; legacy global CSS stays until pages get refactored.
- **Phase 4 notes in user's auto-memory** refer to the *Better Auth migration's* Phase 4, NOT the PLAN.md phases. Different numbering.

---

## At end of session

Update this file in place. Note: what you finished, what's in flight, what's blocked, what the next session should pick up. Don't re-add the per-date session-notes pattern — that lives in `docs/session-notes/` as read-only history from the planning phase.
