-- S&H billing modes + nullable customer-at-intake (2026-05-29).
--
-- Three modes now supported per sh_inventory row:
--   1. in_out_daily   — legacy: in_fee + out_fee + (daily_rate * days/month)
--   2. flat_monthly   — one flat_rate per box per month, no per-day math
--   3. non_billable   — tracked in the yard, excluded from month-end cron
--
-- The customer assignment shifts from intake to audit. Boxes can arrive with
-- no client; the admin picks the client + confirms billing mode/rates during
-- audit. Cron naturally skips rows with NULL client_id.

-- 1. Make rate + client columns nullable so a pending-audit row can carry
--    whichever mode the admin eventually picks. Existing rows already
--    satisfy NOT NULL so the drop is safe.
ALTER TABLE sh_inventory
  ALTER COLUMN client_id DROP NOT NULL,
  ALTER COLUMN in_fee DROP NOT NULL,
  ALTER COLUMN out_fee DROP NOT NULL,
  ALTER COLUMN daily_rate DROP NOT NULL;

-- 2. Billing mode column + flat_rate. Default 'in_out_daily' preserves the
--    behaviour for every existing row.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sh_billing_mode') THEN
    CREATE TYPE sh_billing_mode AS ENUM ('in_out_daily', 'flat_monthly', 'non_billable');
  END IF;
END$$;

ALTER TABLE sh_inventory
  ADD COLUMN IF NOT EXISTS billing_mode sh_billing_mode NOT NULL DEFAULT 'in_out_daily',
  ADD COLUMN IF NOT EXISTS flat_rate numeric;

-- 3. New line type for the month-end cron's flat-monthly path. Postgres
--    requires ADD VALUE outside a transaction in some versions; the
--    IF NOT EXISTS guard makes the migration safely re-runnable.
ALTER TYPE sh_line_type ADD VALUE IF NOT EXISTS 'flat_month';
