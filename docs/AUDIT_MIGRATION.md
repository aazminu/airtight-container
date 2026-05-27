# Physical-audit reconciliation & inventory cleanup migration

**Captured 2026-05-27.** Source: operator's physical yard audit (2026-05-26), treated as **absolute ground truth** for what is currently onsite. Goal: bring the prod `inventory` table into agreement with the audit and split S&H boxes out of the sales table.

> **Deferred to the night of 2026-05-27.** Operator is re-auditing prod outside business hours so the migration runs against a non-drifting snapshot. **Rule:** any inventory row created **after 2026-05-26 15:04 EST** is assumed onsite and excluded from the outbound sweep regardless of audit presence (use `inventory.date > '2026-05-26 15:04 America/New_York'`). The re-audit may revise the unit list in the two scripts.

Scripts:
- `server/scripts/audit-reconcile.sql` — the diff that produced these findings (read-only).
- `server/scripts/audit-cleanup-investigate.sql` — per-row detail + FK refs to finalize the destructive steps (read-only). **Run this next; paste output back.**

---

## Target end-state (operator spec)

1. **`available` set == the audited sales boxes.** Any box the audit didn't find is not onsite.
2. **Everything `sold`/stale and not in the audit → `outbound`.** Sold boxes that *are* in the audit stay `sold` (onsite, awaiting pickup).
3. **The 14 audited-as-S&H rows are deleted from `inventory`.** Operator re-adds them by hand as `sh_inventory` (inbound date matters and must be set manually). No `sh_inventory` rows are created by this migration.
4. Data hygiene: normalize `unit_number`, dedupe, drop test/junk rows, add a unique constraint so dupes can't recur.

---

## Findings (from audit-reconcile.sql, 2026-05-27)

87 audited units: 64 matched, 26 "missing" (5 of which are false negatives — malformed in DB), 613 "DB-present-not-audited" (inflated — ~460 are stale `sold`).

1. **Dirty `unit_number` data.** Embedded spaces + dropped check digits (`PCIU 178340-`, `RFCU 401104-`, `TCLU 308783-`, `TRHU 140421-`), run-together (`NYKU3233005`, `SKYU2953051`), truncated (`TCNU680683-`, blank), typos (`TCKU55305-3`, `XTYZU200054-` = a mis-entered `XYZU200054`). One genuine conflict: audit `UNSU001361-6` vs DB `UNSU001361-5` (check digits disagree).
2. **Duplicate rows** — no unique constraint on `unit_number`. `DRYU929764-9` ×3, `DRYU915283-5` ×2, `INKU227527-2` ×2; `RFCU217783-4` exists as both `outbound` and `available`.
3. **Junk/test rows** under `sold`: `TEST` ×3, `TESTINVOICE`, `MOD REPAIR` ×2, `122024`, a blank unit.
4. **S&H boxes misfiled** as `available` sales stock in `inventory`: 14 rows (Flexbox + Times Square).
5. **Genuinely missing** (~21 after fuzzy matches): all 3 `sh_dd` double-door S&H, 7 Flexbox, a few sales near-typos (audit `TRDU196214-8` vs DB `TRDU196264-1`/`TRDU146214-8`). `ATSU000001-0` (made up) and `TSQU000000-0` (placeholder) are expected absences.

---

## FK safety (drives the whole ordering)

- `invoice_containers.container_id → inventory.id` is **`ON DELETE CASCADE`**.
- `sold.inventory_id → inventory.id` is **`ON DELETE CASCADE`**; `sold_modifications.sold_id → sold.id` cascades too.

**Implications:** deleting an inventory row silently removes its invoice line item + sale record + mods. Therefore:
- Outbound sweep is `UPDATE state`, **never DELETE**.
- S&H-row deletes only proceed where `inv_refs = 0 AND sold_refs = 0` (they're `available`, so expected clean — verify in script section A).
- Dedup keeps whichever duplicate carries the invoice/sold reference; deletes the bare dupe (script section B).
- Junk deletes only where unreferenced; referenced junk gets left or tombstoned, not cascaded.

---

## Migration steps (ordered; each its own transaction, draft)

> **DRAFT — do not run until the open decisions below are resolved and the investigate-script output is reviewed.** Run inside `BEGIN; … ` with verification `SELECT`s, eyeball counts, then `COMMIT`. Take a fresh `pg_dump` of `containers_prod` immediately before.

0. **Backup.** `pg_dump containers_prod` → timestamped file in `~/airtight-cutover/` on EC2.
1. **Normalize + backfill `unit_number`** — enforce canonical **`LLLL ######-#`** for full-length container numbers (4 letters, space, 6 digits, dash, check digit), uppercased. Special cases to accommodate, not reject: (a) **no check digit** → `LLLL ######` (drop the trailing `-#`); (b) **Times Square flat-rate boxes are single digits** (`6`, `7`, …) — keep as-is, they're internal labels, not ISO numbers. Backfill: bulk-rewrite existing rows to canonical where parseable; structurally-broken/typo'd rows (section C) get a manual per-row map. Must run before dedup so collisions surface. **Open: does the canonical stored value include the space, or is the space display-only (storage `LLLL######-#`)? See D4 — this reverses/refines the earlier "display-only space" backlog note in PLAN §8.**
2. **Dedupe** — for each group in section B, delete the non-referenced duplicate(s); keep the referenced survivor.
3. **Delete audited-as-S&H rows** (section A, refs=0). Operator re-adds as `sh_inventory` by hand.
4. **Outbound sweep** — `UPDATE inventory SET state='outbound'` for `sold` rows not in the audit (section F count), and for `available`/`hold`/`pending` rows not in the audit and not fuzzy-matched (section E).
5. **Junk** — delete unreferenced test rows (section C); tombstone/leave referenced ones.
6. **Add `UNIQUE` constraint** on normalized `unit_number` (or a generated normalized column) so dupes can't recur.
7. **Verify** (below), then `COMMIT`.

---

## Open decisions (need operator answer before destructive SQL)

- **D1 — `available`/`hold` not in audit (section E): outbound, or delete?** Spec says "available consistent with audit," so they must leave the `available` set. Default plan: → `outbound`. But a box marked `outbound` with no `sold` row is a half-state. Alternative: delete (if unreferenced) or a dedicated written-off treatment. **Which?**
- **D2 — `UNSU001361-6` vs `UNSU001361-5` check-digit conflict.** Which is correct — fix the DB row to `-6`, or the audit typo'd and it's `-5`?
- **D3 — Outbound `outbound_date`.** Leave existing (mostly null) or stamp a sentinel/migration date for the swept `sold` rows? (Ties to the outbound-flow redesign — receipt-print should own this going forward.)
- **D4 — Is the canonical space stored or display-only?** Operator wants the enforced format shown as `LLLL ######-#` (with space). Decide: store the space (`LLLL ######-#`, simplest WYSIWYG) **or** store `LLLL######-#` and render the space on display only. Affects matching, the unique constraint, and the going-forward validator. (Earlier PLAN §8 backlog said display-only; this is the reconciliation point.)
- **D5 — Sold-not-in-audit blanket outbound.** Confirm every `sold` row absent from the audit should flip to `outbound`, including any with null `sold_date`.

---

## Post-migration verification

- `available` set matches the audited sale boxes exactly (no extras, no missing).
- 0 duplicate normalized `unit_number`s; unique constraint present.
- 0 rows with malformed `unit_number`.
- Audited-as-S&H units absent from `inventory`.
- Invoice count / totals unchanged (no cascade collateral): compare `count(*)` and `sum(total)` on `invoices` before/after.
