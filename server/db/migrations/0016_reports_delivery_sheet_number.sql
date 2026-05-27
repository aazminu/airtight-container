-- Delivery-sheet "AT number": persisted ATYYYYMM### identifier on
-- delivery_sheet reports, monthly-reset sequence (see
-- server/lib/delivery-sheet-number.ts). The outbound flow searches by it.
-- Other report types keep it NULL.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS delivery_sheet_number text;

-- Backfill existing delivery sheets: number them per Eastern-time month
-- of generated_at, ordered oldest-first, zero-padded to 3 digits.
WITH ds AS (
  SELECT
    id,
    'AT'
      || to_char(generated_at AT TIME ZONE 'America/New_York', 'YYYYMM')
      || lpad(
           (row_number() OVER (
              PARTITION BY to_char(generated_at AT TIME ZONE 'America/New_York', 'YYYYMM')
              ORDER BY generated_at, id
            ))::text,
           3, '0'
         ) AS num
  FROM reports
  WHERE report_type = 'delivery_sheet'
    AND delivery_sheet_number IS NULL
)
UPDATE reports r
SET delivery_sheet_number = ds.num
FROM ds
WHERE r.id = ds.id;

-- Unique per number; partial so non-delivery-sheet reports (NULL) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS reports_delivery_sheet_number_key
  ON reports (delivery_sheet_number)
  WHERE delivery_sheet_number IS NOT NULL;
