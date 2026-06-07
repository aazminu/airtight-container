# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## TL;DR — 5 PRs from the 2026-06-06 session; tomorrow = validate + merge

**Live now:** prod on migrations **0022/0023**. PR **#14** (quote-promote `quote_lines` typo) already merged + deployed; operator unblocked.

**Open PRs** (full plan in `~/.claude/plans/indexed-growing-neumann.md`):

| PR | Branch → base | State | What |
| --- | --- | --- | --- |
| [#15](https://github.com/harrylynchh/airtight-container/pull/15) | `fix/puppeteer-consolidation` → `main` | **ready** | Outage fix: one shared Chromium (`server/lib/puppeteer.ts`) + render-count/age recycle; dropped `--single-process` (hangs `page.pdf()`); `mem_limit: 600m` in compose. Also pins the `sh-checkout.test.ts` date flake. |
| [#16](https://github.com/harrylynchh/airtight-container/pull/16) | `feat/quote-invoice-quickwins` → `main` | **ready** | $0 sale price allowed in both create steppers; quote "+ Add line item" copies the line above; localStorage draft autosave (`useDraftPersistence`) + "Discard draft". No migration. |
| [#17](https://github.com/harrylynchh/airtight-container/pull/17) | `feat/mod-rows-quantity` → **#16** | **DRAFT — holds for qty sign-off + `0024`** | Shared `ModificationRows.tsx` (real `<select>` + "Custom" write-in, replaces iPad datalist, fixes preset price-rebind); per-mod **quantity** dropdown 1–20 (migration **0024**); **negative prices** in CurrencyInput; quote **"Download PDF"** (new `GET /api/v2/quote/:id/pdf`). |
| [#18](https://github.com/harrylynchh/airtight-container/pull/18) | `feat/invoice-pagination` → **#15** | **DRAFT** | Multi-page for **invoices + quotes** via shared `server/lib/pdf-print.ts`: page margins + "Page X / N" footer + print-layout fixes (block layout so tables fragment; break-after on subless rows). |

**Two stacks** (don't merge a child before its parent): `main ← #15 ← #18` and `main ← #16 ← #17`. **All four can merge independently in the right order** — they touch mostly disjoint files; only #15↔#18 and the quote files in #16/#17 share paths (that's why they're stacked, no conflicts expected).

**Health:** server tests 226/226 (on #15's branch), client 50/50, `tsc` clean throughout. Rendered real quote + invoice PDFs to confirm qty (`4× $25` → Qty 4 / $25.00 / $100.00) and quote pagination.

---

## Tomorrow's playbook

**Stack A — outage + pagination:**
1. Merge **#15** → GHA deploys. Post-deploy on EC2:
   - `docker inspect airtight-container-backend-1 --format '{{.HostConfig.Memory}}'` → `629145600`
   - `docker stats airtight-container-backend-1` ~30 min light traffic → RSS plateaus, doesn't climb
   - generate a few quote/invoice/report PDFs, then `docker exec … ps -ef | grep chromium` → one browser, recycles after 50 renders / 6 h
   - `free -m` → Swap 2047, nonzero used (already verified)
2. Retarget **#18** base `#15`→`main` (GitHub does this automatically on #15 merge), merge → GHA deploys. Validate: download a **>1-page invoice** and a **>1-page quote** → page-2 content is inset from the top, "Page 2 / 2" footer, column headers repeat; a short invoice/quote stays one page. **Heads-up (owner judgment call):** block-for-print means the doc footer ("Thank you…") now trails the content instead of being pinned to the page bottom on short one-pagers. If you want it bottom-pinned on single-page docs, say so and it's a quick special-case.

**Stack B — features:**
3. Merge **#16** → GHA deploys. Validate in the app: $0 line advances + submits (quote + invoice create); "+ Add line item" duplicates the previous quote line; leave/return to a create page → draft auto-restores, "Discard draft" wipes, submit clears.
4. **#17 is gated on YOUR qty sign-off** (screenshots already sent). When good:
   - apply `server/db/migrations/0024_modification_quantity.sql` to `containers_prod` (manual `psql -f`, additive/idempotent/safe) — coordinate with the merge so schema + code land together;
   - mark #17 ready, retarget base `#16`→`main`, merge → GHA deploys.
   - Validate: mod row is a dropdown; picking/**changing** a preset rebinds its price; "Custom…" reveals free text; qty dropdown 1–20; a `$25` mod at qty 4 reads `$100`; a negative price (e.g. `-50` discount line) is accepted; quote "Download PDF" downloads.

**`0024` is already applied to the LOCAL DB.** Prod is the only place it still needs to run.

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
