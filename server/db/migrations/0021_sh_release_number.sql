-- S&H boxes attach to a release the same way sales containers do
-- (2026-05-29). Operators model the manifest/origin of any incoming
-- container — sales or S&H — via release_numbers, so it's the same
-- table.
--
-- Nullable for now: existing sh_inventory rows have no release. Going
-- forward, the intake flow requires the field. A separate cleanup pass
-- can backfill historical rows by hand if needed.

ALTER TABLE sh_inventory
  ADD COLUMN IF NOT EXISTS release_number_id integer
    REFERENCES release_numbers (release_number_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS sh_inventory_release_idx
  ON sh_inventory (release_number_id);
