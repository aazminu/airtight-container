-- Migration 0019: collapse quote_number to the QYYYYMM### format.
--
-- Old format: Q-YYYYMM-NNNN (4-digit suffix, dashes).
-- New format: QYYYYMM###    (3-digit suffix, no dashes).
--
-- Single-yard volume means we'll never approach the 999/month ceiling,
-- and the operator wants the more compact form on PDFs. Migration must
-- be re-runnable on rows that already match the new format (no-op).
--
-- Strategy: for any row matching the legacy regex, rebuild as
-- Q || replace(prefix, '-', '') || lpad(right(suffix, 3), 3, '0').
-- If the old suffix > 999, error out (would lose information).

BEGIN;

DO $$
DECLARE
  bad_count int;
BEGIN
  SELECT COUNT(*) INTO bad_count
    FROM quotes
   WHERE quote_number ~ '^Q-\d{6}-\d{4}$'
     AND split_part(quote_number, '-', 3)::int > 999;
  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'Migration 0019 cannot proceed: % quotes have a suffix > 999 and would lose information when truncated to 3 digits.',
      bad_count;
  END IF;
END $$;

-- Postgres LPAD truncates strings longer than the target length from the
-- right (so LPAD('0001', 3, '0') = '000'), which would collide every row
-- in the same month onto the same suffix. Cast the suffix to int first
-- to drop the legacy leading zero, then LPAD back to 3 digits.
UPDATE quotes
   SET quote_number = 'Q'
                   || split_part(quote_number, '-', 2)
                   || LPAD(split_part(quote_number, '-', 3)::int::text, 3, '0')
 WHERE quote_number ~ '^Q-\d{6}-\d{4}$';

COMMIT;
