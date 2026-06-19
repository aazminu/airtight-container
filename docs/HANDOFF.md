# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## TL;DR — 2026-06-19 security + logging sweep on 4 local branches (NOT pushed / merged / deployed)

**Work in flight (local commits only, nothing pushed):** a 4-phase adversarial-review-driven security + logging sweep. Each phase is a committed feature branch, **stacked in order off `main`** (each branches off the previous because later phases use the PR1 logger):
- `feat/logging-foundation` — pino + pino-http structured logging (auth/cookie/token redaction, per-request `x-request-id` correlation), centralized `errorBoundary`, error-message hygiene sweep (25 `err.message` 5xx leaks genericized; Twilio passthrough kept), SMS-response token stripped, Docker json-file log rotation.
- `feat/auth-hardening` — `BETTER_AUTH_SECRET` fail-fast, cookie hardening (`useSecureCookies` via URL protocol — safe in dev http + prod https), impersonate-user endpoint blocked, sign-up/forget-password rate limiting, `v2/sold` PATCH → `checkAdmin`, `v1/sold /available/:id` param-ignored bug fixed.
- `feat/input-validation` — SVG-upload stored-XSS blocked, per-route SMS/email rate limits, email-recipient validation, `run-month-end` body validation, `acquisition_price` gated to admins, public receipt-link oracle closed + generic "SMS not available" 503.
- `feat/infra-hardening` — GHA actions SHA-pinned, non-blocking Trivy scan workflow + Dependabot (github-actions), loopback port binding + `cap_drop`/`no-new-privileges`/`pids_limit` on both compose services, nginx CSP (Report-Only).

All four: `tsc --noEmit` clean + **226 tests pass**; PR1 & PR2 also runtime-smoked locally (JSON logs + reqId, impersonate→404, dev login intact). **Branches are stacked — merge in order (or squash the lot). Nothing pushed/deployed; awaiting owner review.**

**⚠️ Before merging `feat/infra-hardening`:** run `docker compose up -d` + generate a PDF — the container-runtime hardening (`cap_drop`/`no-new-privileges`/`pids_limit`) could not be Docker-validated in the work env.

**Phase status + the deliberate deferrals (each with its reason):** see [docs/SECURITY_PLAN.md](SECURITY_PLAN.md) — Phases 1–4 are marked done/partial there (notably deferred: broad `validateBody` mass-assignment wiring, report-list `resolved_data` minimization, container `read_only`/healthchecks, base-image digest pinning).

---

## Previously — all 2026-06-06 work shipped; repo stabilized 2026-06-13

**Live now:** prod stable. All five 2026-06-06 PRs are merged + deployed:
- **#14** quote-promote `quote_lines` fix · **#15** Puppeteer consolidation + `mem_limit: 600m` (outage fix) · **#16** $0 price / copy-line-above / draft autosave · **#17** mod dropdown + per-mod quantity + negative prices + quote "Download PDF" · **#18** multi-page pagination for invoices + quotes (`server/lib/pdf-print.ts`).
- #17 + #18 were combined into `integration/combined-16-17-18` and merged as **#19** (instead of the two separate stacks the old plan described). **#20** then fixed an EC2 disk-space deploy failure (prune images before pull).
- Migration **0024** (per-mod quantity) landed with #19; latest in tree.

**Migrations are now automated (convention changed).** The deploy runs `server/scripts/migrate.ts` on the new image inside one transaction: `pg_dump` backup → apply pending → validate (`scripts/migration-checks/current.ts`) → COMMIT, rolling back if validation throws. Applied versions tracked in a `schema_migrations` table (`0000–0016` are baseline-adopted, never re-run). **No more manual `psql -f` for prod migrations.**

**2026-06-13 session — repo stabilization + dependency security pass:**
- Retired the long-lived **`2.0`** branch and every stale feature/phase/worktree branch (8 agent worktrees removed). Repo is now **trunk-based**: only `main` exists locally and on origin. `CLAUDE.md` "Branching" rewritten to match.
- Brought **`README.md`** current with the 2.0+ stack + features.
- **Vuln pass (Dependabot flagged 14):** fixed the ones that ship to prod — `node-cron` 3→4 (server; drops the vulnerable `uuid`; verified 226 tests + `npm ci --omit=dev`) and `react-router-dom`→6.30.4 (client open-redirect; 50 tests + all 4 builds green).
  - **`better-auth` (high) intentionally left at the deployed 1.6.10.** The advisory is the OAuth *device-authorization* flow, which this app doesn't enable (email/password + Google + admin only) → not reachable. Bumping to 1.6.18 pulls a **zod-4** peer via `better-call` and a `vite@8` svelte optional-peer, which breaks Docker's plain `npm ci`. Revisit alongside a planned better-auth/zod-4 upgrade, not as a one-off.
  - **Remaining alerts are all dev/build tooling** (`vite`/`esbuild`/`vitest`/`vite-node`, `drizzle-kit`'s `@esbuild-kit`): not present in either prod image (frontend = static nginx; backend = `npm ci --omit=dev`), and the advisories are dev-server / Deno / Windows-dev class. **Currently unpatchable** — `esbuild`'s advisory is `<=0.28.0` with no fixed release, so bumping `vite`/`vitest` (majors) wouldn't clear it. Accepted; recheck when esbuild ships a fix.

**Open since the merge (carryover from the old playbook):**
- **Single-page PDF footer** — block-for-print means the doc footer ("Thank you…") now trails the content instead of pinning to the page bottom on short one-pagers. Owner judgment call; quick special-case if you want it bottom-pinned.
- **#15 memory observation window** (~1 week post-deploy) is up — if RSS has stayed flat under load, the t3.small bump stays shelved.

---

## Deferred / open decisions

- **Quote email → @airtightstorage inbox** — Proofpoint same-domain anti-spoof quarantines mail `From: @airtightstorage.com` relayed via Resend; **not a code bug** (sending is healthy, customers + Gmail BCC receive). Fix is a mail-config change (allowlist Resend in Proofpoint, or send from a different domain). Owner-owned; full writeup in auto-memory `quote_email_proofpoint_diagnosis.md`.
- **Single-page footer pinning** — see the #18 heads-up above; awaiting owner preference.
- **t3.small (2 GB) instance bump** — postmortem floor; hold ~1 week of post-#15 observation.

---

## Operator to-do (outstanding)

42 S&H units pre-enrolled in `AUDIT-5-29-26` waiting for manual `/intake` (auto-match will lock to the release on the right unit number):

| Category | Units |
| --- | --- |
| sh_dd (3) | XYZU 220000-9, XYZU 220003-5, XYZU 220017-0 |
| flexbox (15) | FAMU 8270 90/91/92/94 + 102 + 149/157/160/161/165/166/175 + FAMU 891888-6 + FXLU 892476-9 + CICU 202837-0 |
| ts_free (10) | TSQU 000000-0 · TRDU 657039-2 · TRDU 666203-5 · UNSU 001361-6/003768-6/004759-7/006245-7/006625-7/009181-4/020983-0 |
| ts_flat_rate (14) | 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16 |

Each goes through Intake → audit screen → assign customer + billing mode (`flat_monthly` $325/mo for the 14 TS flat-rate, `non_billable` for the 11 TS free, `in_out_daily` for the rest).

Also: invoice **#202605015** (RFCU 217783-4) is still active with `status='awaiting'` — confirm with the customer; the box left the yard 2026-05-27.

---

## Still deferred (not built)

- **S&H invoice editing** — cron-generated invoices are read-only. No PATCH/DELETE for lines, no UI affordance. Escape hatches today: regenerate after fixing the source box, or hand-edit SQL. **Build a proper editor when this becomes routine** (PATCH `/api/v2/sh-invoice/:id/lines/:lineId`, `ShInvoiceDetail` gains edit mode mirroring sales `InvoiceEditor` with the limited S&H line shape).
- **Site-wide trash-icon adoption** beyond invoice + quote (InventoryEditor still has × glyph).
- **Spacing sweep** across remaining CreateInvoice / InventoryEditor.
- **Modal-backdrop "discard?"** integration on editor modals.
- **Quote promote: explicit per-line→container mapping UI** (positional default shipped).
- **New-code unit tests** for `/sold` PATCH + promote with delivery payload (S&H checkout covered).
- **Junk-row sweep** — 3 historical TEST rows + 1 blank-unit row still in outbound. Audit cleanup covered TESTINVOICE (id 173) on prod via a one-liner DELETE.

---

## Open threads

- **Twilio A2P 10DLC** — resubmitted 2026-05-29 with sole-prop wording (`<<LEGAL_NAME>>` placeholder in `twilio.txt`). Outbound stepper hides Driver SMS via `GET /api/v2/report/config/sms` until creds are added. When approved: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID=MGde4ad37ed70fb2bd1bd9330c009ced23` in EC2 `~/airtight-container/.env`.
- **AirPrint `/reports/:id/print` E2E** — operator iPad still recovering from activation-lock. iPhone smoke (2026-05-25) proved iOS → Mango → Star works. Hardware: Star TSP654II + GL.iNet Mango + UniFi U6-Mesh (printer IP `192.168.8.221`).
- **Bolo section** — deferred.
- **Phase 8 (QuickBooks)** — deferred.
- **Spanish translation review** — first-pass machine output is live in yard flows + Outbound. Native review deferred.

---

## Audit reconciliation (2026-05-29)

Operator-led physical audit drove a destructive cleanup against the prod snapshot:
- Restored prod dump locally → applied migrations 0016 → 0021 → ran the reconcile.
- Unit-number normalization: 667 rows formatted to canonical `LLLL ######-#`. Phone normalization: 153 client phones formatted to `XXX-XXX-XXXX`.
- Step 1 (5 fuzzy renames) · Step 2 (3 dedups, 1 audit-as-sale kept-outbound RFCU 217783-4) · Step 3 (14 audited-as-S&H deletes + 1 UNSU 001361-6 follow-up).
- Step 4 (158 available/hold/pending sweep → outbound, cutoff `2026-05-26 15:04 EST` preserved 1 post-cutoff pending box).
- Step 5 (455 sold-not-in-audit sweep → outbound; 3 sold-in-audit rows correctly preserved as physically present).
- 8 missing audit-as-sale boxes inserted under release `AUDIT-5-29-26` (quota 50, enumeration covers all 42 S&H + 8 sales to be intaked).
- Damage normalization (`NEW`→`New`, `wwt`→`WWT`, `as is`→`As-is`, free-text moved to notes). Size normalization (`20'dv`→`20'DV`, `40'hc`→`40'HC`, type-less rows defaulted to `20'DV`).
- 4 paid invoices tombstoned (their containers were junk: TEST × 3, MOD REPAIR × 1). 5 junk inventory rows DELETE'd with cascade. **TESTINVOICE row 173 deleted on prod directly during verify.**
- Active total locked at **$656,924.05** (44 tombstones, 204 active, 248 total).

Full spec + step ordering: [docs/AUDIT_MIGRATION.md](AUDIT_MIGRATION.md).

---

## Conventions

- `main` deploys on push.
- Migrations stay numbered SQL files; the deploy applies pending ones automatically + transactionally via `server/scripts/migrate.ts` (see TL;DR). Run locally with `tsx server/scripts/migrate.ts`. **Latest in tree: `0024`.**
- `userContext.jsx` is the global user/popup/theme context (popup state now bridges to the Toast viewport — every existing `setPopup` call still works).
- Deploy build runs `tsc --noEmit && vite build` inside `Dockerfile.frontend` — any tsc error breaks deploy. `App.jsx` is `.jsx` so it's not type-checked; eyeball on back-merge.

---

## Don't

- **Don't push to `main` without an explicit deploy intent.** GHA fires on every `main` push.
- **Don't `--no-verify`** any commit hook.
- **Don't `psql -f <dump>` into an existing populated DB** — drop + create first. Verified during this session: a partial restore leaves drift (e.g. the TESTINVOICE row that resurfaced on prod despite being absent from the dump).
- **Don't delete the `~/airtight-cutover/` archives** on EC2 — rollback artifacts. The pre-audit + pre-restore snapshots are dated and worth keeping for at least a week post-deploy.

---

## At end of session

Update this file in place. Don't accumulate dated subsections — overwrite stale state.
