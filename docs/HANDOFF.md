# HANDOFF — live session-transition state

> **What this is:** the single rolling document any agent reads before starting work. Update at the end of every working session — overwrite stale state in place, don't accumulate timestamped sections. Keep under one page.

---

## TL;DR

**2.0 is live on prod as of 2026-05-26.** Cutover done. PR #9 (security) + PR #10 (deploy hotfix) deployed. Phases 1–9 all merged. Phase 8 (QuickBooks) deferred.

**In flight (2026-05-28): structural batch on `phase-struct/structural-batch`** (off `2.0`, NOT pushed/merged). 60+ commits ahead of `2.0` covering the delivery epic, Quote domain, Outbound stepper, promote-to-invoice rework, and the new address picker. **Branch tip `efa2d30`. tsc clean both sides. Client 52/52 tests, server 205/205.** Verified against the local mirror only.

The next session is a **continuation of the operator's validation pass.** Start with the table below.

---

## Tested + working (operator confirmed this session)

- **Quote create + edit + PDF + email** — flagged minor polish items, all addressed.
- **Quote-number format `QYYYYMM###`** — migration `0019` backfilled local rows (`Q-202605-0001` → `Q202605001`).
- **Outbound page basics** — search by AT number, pending-pickups list (after the route-order fix), `complete-pickup` flips state.
- **Reports grid + detail** — both render AT number now, not `#id`.
- **Delivery sheet stepper** — invoice-scoped picker, Driver step removed, container-delivery edits (carrier / door / per-box address) PATCH back to `sold` before report POST.
- **Receipt template** — "Pickup Number" label + render-time timestamp.

## Still to evaluate next session (in priority order)

1. **Promote-to-invoice 4-step Stepper** (`dbf043e`) — pick boxes (capped at line count) → ship-to → per-container delivery → **full `<InvoiceTemplate>` preview** → Create. The preview is computed client-side from the operator's selections; should match the spawned invoice exactly.
2. **Delivery resolver respects invoice ship-to** (`efa2d30`, just landed) — promote a quote with a non-billing ship-to and **no** per-box override, then make a delivery sheet for that invoice. The sheet should show the ship-to address, not the client's billing. (Pre-fix: silently fell to client billing.)
3. **Outbound stepper end-to-end** (`f3def76` + `0a96adb`) — Pick sheet → Confirm → Driver SMS (skipped when Twilio not configured; new `GET /api/v2/report/config/sms`) → Mark Outbound & Print Receipt. The big primary button on step 4 is the **only** UI trigger for the sold→outbound flip; synchronous flips on report create + regenerate have been removed.
4. **Outbound i18n** (`ba4157a`) — toggle language to Spanish from the navbar; every string on `/outbound` and the "Outbound / Salida" nav link should translate.
5. **AddressFields with Places autocomplete** (`5cf75db`, `8584361`) — used everywhere now (ClientForm, CreateInvoice ship-to + per-box, InvoiceEditor ship-to + per-box, CreateReport stepper, Promote stepper). Structured fields hidden; only the summary + Change link. Verify the typeahead dropdown shows up under the input (uses `<gmp-place-autocomplete>` from Places API New).
6. **Quote editor styling** (`0fef8c6`, `8392d2b`) — trash icons (red, far right) replace every `×` in the quote screens; `<CurrencyInput>` on mod prices; description column 15% narrower; spacing between Notes and the subtotal block; new customer picker on `QuoteEditor`. `DestinationField` (Places picker, no free typing) used in line-item destinations.
7. **Print receipt button on delivery sheet view** — confirmed inert (no state change). Outbound stepper is the only flip trigger.

If the audit migration (deferred from 2026-05-27) is still pending, do that on its own — read-only diffs are in `audit-cleanup-investigate.sql`, open decisions are D1–D5 in [docs/AUDIT_MIGRATION.md](AUDIT_MIGRATION.md).

---

## Deploy checklist for the next prod cut

Apply migrations in order, all idempotent (`IF NOT EXISTS` / explicit re-runnable guards), all applied + verified on the local mirror.

- `server/db/migrations/0016` — delivery-sheet AT number
- `server/db/migrations/0017` — `trucking_companies` + invoice ship-to + per-box `sold` delivery cols
- `server/db/migrations/0018` — quotes tables
- `server/db/migrations/0019` — quote-number format collapse (`Q-YYYYMM-NNNN` → `QYYYYMM###`, backfills)
- Then the **audit cleanup** migration (still to be written after the re-audit + D1–D5 decisions).

**Build / env**:
- `Dockerfile.backend` runs `npm run build:quote-template` (new quote PDF bundle, `client/vite.config.quote-template.ts`). Watch the deploy build.
- `Dockerfile.frontend` accepts `ARG VITE_GOOGLE_MAPS_API_KEY`; `.github/workflows/deploy.yml` passes it from `${{ secrets.VITE_GOOGLE_MAPS_API_KEY }}`. **Add the secret in GitHub** before the next deploy if you want address autofill in prod (absent = picker hidden, no crash).
- `TWILIO_*` in EC2 `.env` still pending A2P approval. Outbound step 3 hides itself via `/api/v2/report/config/sms` when Twilio isn't configured, so the flow runs end-to-end without it.

**Visual spot-checks after deploy**: a multi-mod invoice PDF, a quote PDF, a delivery sheet showing per-box address + door + carrier + AT number, and a promote-to-invoice walk-through with a ship-to override.

Optional: `server/scripts/normalize-phones.ts --apply` (phone backfill, written but not run on prod).

---

## Still deferred (not built)

- **Site-wide trash-icon adoption** — `<IconButton icon="trash">` exists in `components/ui`; adopted in QuoteEditor + CreateQuote step 2. **Not yet adopted** in InvoiceEditor / CreateInvoice / InventoryEditor — they still use the old `styles.iconBtn` × glyph. Same for the "+ Add modification" prominent-button style (only quote screens have it).
- **Spacing sweep** — quote screens tightened; InvoiceEditor / CreateInvoice fieldGrid spacing untouched.
- **Toast / popup verbosity sweep** — every catch block, dedicated pass.
- **Unit-number STORAGE format** — display formatting shipped; the canonical-form decision is AUDIT_MIGRATION D4.
- **Remaining CurrencyInput adoption** — Intake / S&H / InventoryEditor money fields. Primitive exists; quote + invoice fields adopted.
- **Modal-backdrop "discard?"** integration on editor modals.
- **Quote promote: explicit per-line→container mapping UI** (positional default shipped; drag/assign is a stretch).
- **New-code unit tests** for `delivery-sheet-number` / `complete-pickup` / `/sold` PATCH / promote with delivery payload.
- **Audit migration** — destructive cleanup SQL still to write after the re-audit + D1–D5 decisions in `docs/AUDIT_MIGRATION.md`.

---

## Open threads

- **Twilio A2P 10DLC** — resubmitted 2026-05-26 with tightened consent language; awaiting carrier review. SMS Send returns 503 with a clean toast until then. The Outbound stepper hides its Driver SMS step when `/api/v2/report/config/sms` says `enabled: false` — operator can run end-to-end without Twilio. Creds to add when ready: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID=MGde4ad37ed70fb2bd1bd9330c009ced23` in EC2 `~/airtight-container/.env`.
- **AirPrint `/reports/:id/print` E2E** — operator iPad still recovering from activation-lock. iPhone smoke (2026-05-25) proved the iOS → Mango → Star path works. Hardware: Star TSP654II + GL.iNet Mango + UniFi U6-Mesh (printer IP `192.168.8.221`).
- **Bolo section + invoices-sans-containers** — deferred (quotes solve the latter).
- **Phase 8 (QuickBooks)** — deferred.
- **Spanish translation review** — first-pass machine output is live in yard flows + Outbound. Native review deferred.

---

## What changed during the cutover

(unchanged from prior state — kept for context)

- pg_dump'd prod → restored locally → ran migrations 0000–0015 + `migrate-data-v2.ts --apply` → pg_dump'd → scp'd back, restored.
- 40 orphan invoices tombstoned. 6 sentinel `'2024-01-01'` outbound dates nullified. 2 malformed-address contacts editable via UI. 1 inventory row on `LEGACY-UNKNOWN` release.
- Final state: 244 invoices / 152 clients / 676 inventory / 282 release_numbers / 15 sale_companies.
- Original prod dump `containers_1.0_CUTOVER_5-25-26.psql` still on EC2 in `~/airtight-cutover/`. Don't delete — rollback artifact.

---

## Security pass — 2026-05-25/26

PR #9 (`e04aa9c`) + PR #10 (`8b02fc7`) shipped 5 CRITs + 4 HIGHs. Everything still deferred lives in [docs/SECURITY_PLAN.md](SECURITY_PLAN.md) — PR #11 (rate limits, mass-assignment Zod, err.message hygiene, Better Auth hardening) + PR #12 (supply-chain pinning, container hardening, presigned-PUT restrictions, dep updates).

---

## Conventions

- `2.0` is the merge target for ongoing work. `main` deploys on push.
- Migrations stay numbered + applied manually (`psql -f`); drizzle-kit not at runtime. Prod is at `0015`.
- `userContext.jsx` is the global user/popup/theme context.
- Deploy build runs `tsc --noEmit && vite build` inside `Dockerfile.frontend` — any tsc error breaks deploy. `App.jsx` is `.jsx` so it's not type-checked; eyeball on back-merge.

---

## Don't

- **Don't push to `main` without an explicit deploy intent.** GHA fires on every `main` push.
- **Don't `--no-verify`** any commit hook.
- **Don't restore the legacy schema** by running prod migrations against the local DB; use the dump-and-restore workflow.
- **Don't delete `~/airtight-cutover/containers_1.0_CUTOVER_5-25-26.psql`** until 2.0 is stable in prod (give it a week).

---

## At end of session

Update this file in place. Don't accumulate dated subsections — overwrite stale state.
