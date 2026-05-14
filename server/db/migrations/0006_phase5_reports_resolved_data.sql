-- Phase 5 PR 5.3 — snapshot the resolved data on each report row.
--
-- `parameters` is what the operator submitted (container_id, period,
-- client_id, etc). `resolved_data` is the full data blob the template
-- renders from — joined customer + container + sold rows for delivery
-- sheets, aggregated sums for P&L, and so on.
--
-- We persist the resolved snapshot so that:
--   1. Re-rendering a PDF months later (same URL, new viewer) shows
--      the numbers as they were at generation time, even if the
--      underlying sold/invoices rows have since changed.
--   2. The /reports/:id detail page can render without re-running
--      the resolver SQL on every view.
--   3. Historical P&Ls are stable — they don't shift when a back-
--      dated invoice gets entered.
--
-- Idempotent. Existing rows pre-PR-5.3 will keep resolved_data NULL
-- until a Regenerate action recomputes them.

ALTER TABLE "reports"
    ADD COLUMN IF NOT EXISTS "resolved_data" jsonb;

ALTER TABLE "reports"
    ADD COLUMN IF NOT EXISTS "pdf_generated_at" timestamp with time zone;

ALTER TABLE "reports"
    ADD COLUMN IF NOT EXISTS "emailed_at" timestamp with time zone;
