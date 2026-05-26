-- Stop decrementing release_number_count at intake; it becomes the quota.
--
-- Previously the intake handler decremented release_number_count on every
-- box logged. After this PR the column is the quota: set at creation,
-- never decremented, and auto-bumped only when filled overshoots.
--
-- This backfill is intentionally minimal: where actual intake already
-- exceeds the stored count (including auto-completed releases where the
-- decrement landed at zero), set the stored count to filled. Everything
-- else stays untouched, so we don't fabricate quotas that may not match
-- what the operator actually provisioned. Under-filled mid-fill releases
-- will now display "filled / remaining_slots" until the auto-bump catches
-- up on the next intake — that's accepted in exchange for not clobbering
-- legitimate allocations.

UPDATE release_numbers
SET release_number_count = inv.cnt
FROM (
  SELECT release_number_id, COUNT(*)::int AS cnt
  FROM inventory
  WHERE release_number_id IS NOT NULL
  GROUP BY release_number_id
) inv
WHERE release_numbers.release_number_id = inv.release_number_id
  AND release_numbers.release_number_count < inv.cnt;
