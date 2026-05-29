-- Delivery-sheet-as-invoice-extension epic (2026-05-27). Adds:
--   1. trucking_companies entity (+ FK on sold for the outbound trucker)
--   2. invoice-level ship-to address (defaults to the client's billing)
--   3. per-container delivery address + door orientation on sold
-- The 3-level cascade (client billing -> invoice ship-to -> per-box
-- delivery) is applied in the UI; these columns hold the resolved values.

-- 1. Trucking companies -------------------------------------------------
CREATE TABLE IF NOT EXISTS trucking_companies (
  id serial PRIMARY KEY,
  company_name text NOT NULL UNIQUE,
  dispatch_name text,
  dispatch_phone text,
  dispatch_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sold
  ADD COLUMN IF NOT EXISTS outbound_trucking_company_id integer
    REFERENCES trucking_companies (id) ON DELETE SET NULL;

-- Backfill: one company per distinct existing freetext outbound_trucker,
-- then link the sold rows to it. Inbound inventory.trucking_company is
-- intentionally left as freetext for now.
INSERT INTO trucking_companies (company_name)
SELECT DISTINCT btrim(outbound_trucker)
FROM sold
WHERE outbound_trucker IS NOT NULL
  AND btrim(outbound_trucker) <> ''
ON CONFLICT (company_name) DO NOTHING;

UPDATE sold s
SET outbound_trucking_company_id = tc.id
FROM trucking_companies tc
WHERE tc.company_name = btrim(s.outbound_trucker)
  AND s.outbound_trucking_company_id IS NULL
  AND s.outbound_trucker IS NOT NULL
  AND btrim(s.outbound_trucker) <> '';

CREATE INDEX IF NOT EXISTS sold_outbound_trucking_company_idx
  ON sold (outbound_trucking_company_id);

-- 2. Invoice ship-to address -------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS ship_to_same_as_billing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ship_to_name text,
  ADD COLUMN IF NOT EXISTS ship_to_street text,
  ADD COLUMN IF NOT EXISTS ship_to_city text,
  ADD COLUMN IF NOT EXISTS ship_to_state text,
  ADD COLUMN IF NOT EXISTS ship_to_zip text;

-- 3. Per-container delivery address + door orientation -----------------
ALTER TABLE sold
  ADD COLUMN IF NOT EXISTS delivery_name text,
  ADD COLUMN IF NOT EXISTS delivery_street text,
  ADD COLUMN IF NOT EXISTS delivery_city text,
  ADD COLUMN IF NOT EXISTS delivery_state text,
  ADD COLUMN IF NOT EXISTS delivery_zip text,
  ADD COLUMN IF NOT EXISTS door_orientation text;
