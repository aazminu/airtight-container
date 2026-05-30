-- Auto-uncomplete a pickup when its assignment count drops below quota
-- (2026-05-29). Catches three deletion paths that would otherwise leave
-- a pickup stuck at is_complete=true:
--   1. sh_inventory DELETE cascading through pickup_number_assignments
--   2. admin detach via DELETE /api/v2/pickup/:id/assignments/:box
--   3. test cleanup
--
-- The admin-detach route still recomputes is_complete in JS as
-- belt-and-suspenders; this trigger is the cheap second line and
-- covers the other paths.

CREATE OR REPLACE FUNCTION recompute_pickup_complete() RETURNS trigger AS $$
BEGIN
  UPDATE pickup_numbers
  SET is_complete = false,
      completed_at = NULL
  WHERE pickup_number_id = OLD.pickup_number_id
    AND is_complete = true
    AND (SELECT COUNT(*) FROM pickup_number_assignments
         WHERE pickup_number_id = OLD.pickup_number_id) < pickup_count;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER pickup_recompute_complete_after_delete
AFTER DELETE ON pickup_number_assignments
FOR EACH ROW EXECUTE FUNCTION recompute_pickup_complete();
