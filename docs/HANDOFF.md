# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## TL;DR

**Shipped & live.** PR #12 and PR #13 are merged and deployed; cutover ran and **prod is on migrations 0022/0023** (confirmed live 2026-06-06 via `server/scripts/prod-diagnose.sh`).

**Post-ship bug week (2026-06-06).** Three operator-reported issues triaged:

1. **Quote promote 500'd** — `relation "quote_lines" does not exist` (typo for `quote_line_items` in `routes/v2/quote.js`). **Fixed → PR #14 merged → deploy green, operator unblocked.**
2. **Quotes "not reaching the work email"** — *not a bug.* Sending is healthy (customers + Gmail BCC receive). Root cause: Proofpoint same-domain anti-spoof on `airtightstorage.com` quarantines mail that's `From: @airtightstorage.com` but relayed via Resend, so the self-addressed copy never lands. **Deferred by owner.** Full writeup in auto-memory `quote_email_proofpoint_diagnosis.md`.
3. **Outage remediation (2026-06-04 OOM hard-lock).** **PR [#15](https://github.com/harrylynchh/airtight-container/pull/15) OPEN — next step is review + merge.** Consolidates the 3 separate Puppeteer browsers into one shared instance (`server/lib/puppeteer.ts`) with a render-count/age recycle, drops `--single-process` (verified it hangs `page.pdf()`), and adds `mem_limit: 600m` to the backend in `docker-compose.yml`. Swap (2 GB) is already live on EC2. Also folds in a fix for the date-relative `sh-checkout.test.ts` flake (fixture `intake_date` was `now()`-relative against hardcoded 2026 windows; now pinned to `2026-04-01`).

**Feature batch (2026-06-06), 3 more PRs open** (plan in `~/.claude/plans/indexed-growing-neumann.md`):

4. **PR [#16](https://github.com/harrylynchh/airtight-container/pull/16) — quick wins** (`feat/quote-invoice-quickwins` → `main`, ready): $0 sale price allowed in both create steppers; quote "+ Add line item" copies the line above; localStorage draft autosave (`useDraftPersistence`) on quote+invoice create with auto-restore + "Discard draft". No migration. client 50/50, tsc clean.
5. **PR [#17](https://github.com/harrylynchh/airtight-container/pull/17) — mod dropdown + quantity** (`feat/mod-rows-quantity`, **DRAFT, stacked on #16**). Shared `ModificationRows.tsx` (real `<select>` + "Custom" write-in, replaces iPad-hostile datalist, fixes preset price-rebind). Per-modification **quantity** ("4× windows"): migration **0024** + schema/validation/ops/PDF. **HOLD: owner reviewing the qty render (screenshots sent); apply `0024` to prod only after sign-off.**
6. **PR [#18](https://github.com/harrylynchh/airtight-container/pull/18) — multi-page invoices** (`feat/invoice-pagination`, **DRAFT, stacked on #15**). Page top/bottom margins + "Page X / N" footer; short invoices no longer forced to 2 pages. Invoice-render-path only.

**Tests:** server 226/226 (on #15's branch), client 50/50, tsc clean throughout.

---

## Next concrete step

**Merge order matters** (two stacks):

1. **PR #15** (outage) → then **PR #18** retargets `main` & merges (pagination). Post-#15 checks:

| Check | Expected |
| --- | --- |
| `docker inspect airtight-container-backend-1 --format '{{.HostConfig.Memory}}'` | `629145600` (600 MB) |
| `docker stats …` (~30 min) | RSS plateaus | 
| `docker exec … ps -ef \| grep chromium` after a few PDFs | one browser, recycles after 50/6h |

2. **PR #16** (quick wins) → then, after owner signs off on the qty render, **PR #17**: apply `server/db/migrations/0024_modification_quantity.sql` to `containers_prod` (additive, safe), retarget #17 to `main`, merge. (`0024` already applied to **local** DB.)

**Deferred:** quote-email Proofpoint config (owner); t3.small instance bump (~1 wk observation).

---

## Operator to-do once prod is back up

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
- Migrations stay numbered + applied manually (`psql -f`); drizzle-kit not at runtime. **Prod is at `0023`.**
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
