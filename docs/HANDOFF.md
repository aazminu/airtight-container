# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## TL;DR

**2.0 is live on prod as of 2026-05-26.** Cutover dump-and-restored from the legacy 1.0 schema; backend boots clean; auth flow works; public pages render; PR #9 (security) + PR #10 (deploy hotfix) deployed. Phases 1–9 all merged. Phase 8 (QuickBooks) still deferred.

Next obvious moves: resubmit Twilio A2P 10DLC campaign with the new public URLs, smoke `/reports/:id/print` AirPrint on the operator's iPad once it's back, and work through `docs/SECURITY_PLAN.md` (PR #11 + PR #12 backlog).

**In flight (2026-05-27): physical-audit inventory cleanup — DEFERRED to tonight.** Operator did a full yard audit (ground truth), we reconciled it against prod `inventory`. Migration deferred so operator can re-audit outside business hours; rule: rows created after **2026-05-26 15:04 EST** count as onsite. Findings + destructive-migration plan in [docs/AUDIT_MIGRATION.md](AUDIT_MIGRATION.md); big operator-meeting backlog in [PLAN.md §8](PLAN.md#8-open-follow-ups-for-implementation-time). **When resuming the migration:** re-run `audit-cleanup-investigate.sql` after the re-audit, resolve D1–D5 in AUDIT_MIGRATION.md, then write the transactional destructive SQL. Nothing run against prod yet — read-only diffs only. S&H month-end cron confirmed not active in prod (no S&H boxes yet; fine).

**Structural batch (2026-05-27) — built on branch `phase-struct/structural-batch` (off `2.0`, NOT pushed, NOT merged to `2.0`/`main`). Awaiting operator test.** Client + server tsc clean (server holds at its pre-existing 3-error baseline: `outbound-from-delivery.ts`, `invoice-ops.test.ts`, `report.test.ts`). All verified against the local mirror only.
- **DONE — clean container deletion.** Available-only, transactional, reopens the release slot. Verified end-to-end via Playwright (delete frees the slot; sold/hold→409; missing→404).
- **DONE — outbound flow** (operator priority):
  - `ATYYYYMM###` delivery-sheet numbering: **migration 0016** (column + unique partial index + backfill), advisory-lock sequencer (`server/lib/delivery-sheet-number.ts`), allocated on delivery-sheet create + stamped into `resolved_data`. **0016 applied to LOCAL mirror only — NOT run on prod.**
  - Receipt-print = outbound: `POST /api/v2/report/:id/complete-pickup` flips `sold→outbound` + stamps `outbound_date=now`; date-based auto-flip cron kept as fallback.
  - `/outbound` screen (nav link added): search by AT#, confirm, "Mark picked up & print receipt"; `GET /api/v2/report/by-number/:number` lookup. Driver SMS left to the delivery-sheet detail page (owns A2P consent). Verified end-to-end (create→AT202605001→lookup→complete-pickup→outbound; idempotent; screen renders).
  - Outbound date removed from the invoice editor; **invoice UPSERT no longer writes `sold.outbound_date`** (was clobbering it on every edit).
- **DONE — client-form domain** (merged from agent worktree): email optional on add-client + empty-string→null coercion; phone normalization to `XXX-XXX-XXXX [EXT. …]` + one-shot `server/scripts/normalize-phones.ts` (**written, NOT run**).
- **DONE — invoice-PDF domain** (merged from agent worktree): emailed invoice PDF now includes modification line items (server joins `sold_modifications`; always re-renders on send); new `GET /api/v2/invoice/:id/pdf` "Download PDF" button. **Needs a visual spot-check** of a multi-mod invoice PDF (couldn't render Puppeteer without S3 creds).
- **Before merging to `2.0`:** apply migration 0016 to prod; visual-check the invoice PDF mods; consider running `normalize-phones.ts --apply`. Two stale agent worktree branches (`worktree-agent-*`) can be pruned. A third worktree `worktree-agent-a9f346f98e443245e` was NOT created by this session — leave it.

**Deferred (called out, not built):** Google Places address autofill (needs `GOOGLE_MAPS_API_KEY`); delivery-sheet-as-invoice-extension redesign + per-box delivery address + trucking-company entity (large interrelated epic, overlaps tonight's migration); Quote document type; S&H free/flat billing (ride with S&H onboarding); unit-number display/format (waits on migration decision D4); toast/verbosity sweep (touches every catch block — dedicated pass).

Unit-number normalization spec refined (strict `LLLL ######-#`, accommodate no-check-digit + single-digit TS boxes, backfill) — folded into AUDIT_MIGRATION.md.

---

## What changed during the cutover

- **Schema migration**: prod was on legacy 1.0 (contacts, releases, users, no presets, no reports). pg_dump'd prod → restored locally as `containers_cutover` → ran migrations 0000–0015 + `migrate-data-v2.ts --apply` → pg_dump'd → scp'd back to prod, dropped + recreated `containers`, restored. Operator decisions baked in:
  - 40 orphan invoices (no `invoice_containers`, all $0 totals) → tombstoned (`deleted_at = NOW()`, `status = 'cancelled'`). Their `invoice_number`s stay occupied so the YYYYMM sequence is contiguous.
  - 6 `sold` rows still on the `'2024-01-01'` sentinel `outbound_date` → nullified.
  - 2 new contacts (151 `cust pu`, 152 `Palisades Interstate Park Commission`) have malformed addresses (whole `contact_address` field dumped into `street`). Editable via `/clients` UI; not blocking.
  - 1 inventory row landed on the `LEGACY-UNKNOWN` placeholder release (no matching `acceptance_number`).
- **Final post-cutover state** (verified): 244 invoices (204 paid + 40 cancelled), 152 clients, 676 inventory rows, 282 release_numbers (incl. LEGACY-UNKNOWN), 15 sale_companies, Better Auth tables intact (2 users / 10 sessions).
- **Original prod dump (`containers_1.0_CUTOVER_5-25-26.psql`) is still on EC2** in `~/airtight-cutover/`. Don't delete — that's the rollback artifact. Combined with reverting `main` to `71ade9c`, full rollback is ~5 minutes.

---

## Security pass — 2026-05-25/26

Full audit done across auth/authz, injection, data exposure, infra. Findings ranked CRIT → INFO. PR #9 (`e04aa9c`) + PR #10 (`8b02fc7`) shipped the 5 CRITs and 4 HIGHs:

- Deleted open email relay `/api/v1/send` (any auth user could send arbitrary HTML email from `michelle@`).
- HTML-escape `client_name` in invoice email body (stored XSS via operator-edited client names).
- Allowlist on `PUT /api/v2/dashboard/:id` role transitions (was: write any string to `user.role` unchecked).
- Pinned SSH host key in `deploy.yml` (was: `ssh-keyscan` TOFU on every deploy).
- CORS_ORIGIN allowlist boot guard.
- Dropped root in both Dockerfiles (`USER app` + `nginxinc/nginx-unprivileged`).
- `BCC` moved from hardcoded gmails to `SEND_BCC` env var.
- Deleted `Invoice.jsx` (orphan with `dangerouslySetInnerHTML`) + `docs/schema.psql` (legacy DDL dump).
- nginx security headers + dotfile/sourcemap deny in `nginx.frontend.conf`.
- `npm audit fix` on server: 12 → 10 (high cleared).

**Everything still deferred lives in [docs/SECURITY_PLAN.md](SECURITY_PLAN.md)** — PR #11 (rate limits, mass-assignment Zod, err.message hygiene, Better Auth hardening) + PR #12 (supply-chain pinning, container hardening, data minimization, presigned-PUT restrictions, dep updates).

---

## Open threads

- **Twilio A2P 10DLC campaign** — resubmitted 2026-05-26 with tightened consent language. Form field text saved locally as `twilio.txt` (gitignored, delete after). First two rejections cited (1) privacy policy auth-gated and (2) opt-in consent language non-compliant. Both addressed: public `/privacy-policy` + `/sms-terms` pages now live; "How do end users consent" field now contains verbatim operator script with all 7 CTIA elements (brand, purpose, frequency, msg/data rates, STOP, HELP, policy URLs) + attestation-system description. Awaiting carrier review (1–3 business days typical). Still need to add Twilio creds (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID=MGde4ad37ed70fb2bd1bd9330c009ced23`) to EC2 `~/airtight-container/.env` before SMS goes live; SMS Send returns 503 with a clean toast until then.
- **AirPrint `/reports/:id/print` E2E** — operator iPad still recovering from activation-lock. iPhone smoke (2026-05-25) proved the iOS → Mango → Star path works; this remaining test is low-risk. Hardware: Star TSP654II + GL.iNet Mango + UniFi U6-Mesh, indoor wiring confirmed (printer IP `192.168.8.221`).
- **Bolo section + invoices-sans-containers** — features the operator wants but explicitly deferred. Workshop later.
- **Phase 8 (QuickBooks)** — deferred.
- **Spanish translation review** — deferred. First-pass machine output is live in yard flows only.
- **40 orphan invoices** — resolved (tombstoned during cutover).

---

## Conventions that survived the cutover

- `2.0` branch is no longer "long-running rewrite"; it's now the merge target for ongoing work. `main` deploys to EC2 on push (GHA `deploy.yml`). PRs land on `main` via `2.0 → main` PRs.
- Migrations stay numbered + applied manually (`psql -f`); drizzle-kit not used at runtime. Up to `0015_invoice_status.sql` on prod.
- `userContext.jsx` is the global user/popup/theme context (renamed from `restaurantcontext.jsx` 2026-05-25).
- The 4 pre-existing `'global' not defined` tsc errors in `InvoiceEditor.test.tsx` + `InvoicesGrid.test.tsx` were fixed via `globalThis` swap in PR #7. tsc is now genuinely clean across the client.
- The deploy build runs `tsc --noEmit && vite build` inside `Dockerfile.frontend` — any tsc error breaks deploy. App.jsx is `.jsx` so it's not type-checked; eyeball it manually on any back-merge (PR #6 lesson).
- The legacy `/privacy` and `/terms` routes from PR #5 no longer exist on `2.0` (replaced by `/privacy-policy` and `/sms-terms`). Twilio's previous submission URLs will 404 — resubmission with the new URLs is required.

---

## Don't

- **Don't push to `main` without an explicit deploy intent.** GHA fires on every `main` push.
- **Don't `--no-verify`** any commit hook.
- **Don't restore the legacy schema** by running prod migrations against the local DB; use the dump-and-restore workflow instead.
- **Don't delete `~/airtight-cutover/containers_1.0_CUTOVER_5-25-26.psql` from EC2** until you're sure 2.0 is stable in prod (give it a week).

---

## At end of session

Update this file in place. Don't accumulate dated subsections — overwrite stale state.
