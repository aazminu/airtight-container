-- Sales-invoice lifecycle status. Closes the long-running gap where
-- sales invoices only carried sent_at (boolean-ish) but no real
-- billing state. S&H invoices have had a separate status enum since
-- PR 3.6; this brings the sales side in line, with one extra state
-- ('delinquent') and one explicit lifecycle endpoint ('cancelled').
--
-- States:
--   draft       — created, not yet finalized. Default on new rows.
--   awaiting    — sent to the customer, payment expected.
--   paid        — payment received.
--   delinquent  — sent and overdue (operator-marked; no auto-flip).
--                 UI shows a "30+ days unpaid" hint past that
--                 threshold but the status itself only changes on a
--                 click.
--   cancelled   — legitimate invoice the deal fell through on.
--                 Distinct from deleted_at (operator-mistake tombstone
--                 from PR 9.5) — both stay, different semantics.
--
-- Backfill rule: every existing non-tombstoned invoice gets 'paid'.
-- Live yard data is historical and already collected on; marking all
-- of it 'paid' avoids poisoning dashboards with a wall of 'awaiting'
-- right after the rewrite cutover.
--
-- Audit columns mirror the SMS-consent pattern (0014): two columns
-- capture who flipped the status and when, so any later dispute about
-- "who marked this paid?" has a trail.

CREATE TYPE "invoice_status" AS ENUM (
  'draft',
  'awaiting',
  'paid',
  'delinquent',
  'cancelled'
);

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "status" invoice_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "status_changed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "status_changed_by_user_id" text;

-- Backfill: every existing non-tombstoned invoice is presumed paid.
UPDATE "invoices"
   SET "status" = 'paid',
       "status_changed_at" = NOW()
 WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices" ("status");
