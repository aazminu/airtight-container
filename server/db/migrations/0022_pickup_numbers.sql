-- Pickup numbers — outbound analogue of release numbers, used at S&H
-- checkout (2026-05-29). Issued by the freight company picking up; each
-- has a quota of boxes they'll collect under that number. The strict
-- no-overenrollment rule is enforced server-side at the
-- /sh-inventory/outbound endpoint via SELECT FOR UPDATE on the pickup
-- row. Unlike releases, pickups don't pre-bind unit numbers — they're
-- functionally counters.
--
-- sh_inventory_id is the PK on the assignment table: one pickup per
-- box. Re-onboarding a returned box always creates a new sh_inventory
-- row, so this constraint never blocks a returning unit.

CREATE TABLE IF NOT EXISTS pickup_numbers (
  pickup_number_id    serial PRIMARY KEY,
  sale_company_id     integer NOT NULL
                        REFERENCES sale_companies (sale_company_id) ON DELETE CASCADE,
  pickup_number_value text NOT NULL,
  pickup_count        integer NOT NULL DEFAULT 1 CHECK (pickup_count >= 1),
  is_complete         boolean NOT NULL DEFAULT false,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pickup_numbers_value_uq
  ON pickup_numbers (pickup_number_value);

CREATE INDEX IF NOT EXISTS pickup_numbers_company_idx
  ON pickup_numbers (sale_company_id);

CREATE INDEX IF NOT EXISTS pickup_numbers_active_idx
  ON pickup_numbers (is_complete) WHERE is_complete = false;

CREATE TABLE IF NOT EXISTS pickup_number_assignments (
  sh_inventory_id  integer PRIMARY KEY
                     REFERENCES sh_inventory (id) ON DELETE CASCADE,
  pickup_number_id integer NOT NULL
                     REFERENCES pickup_numbers (pickup_number_id) ON DELETE RESTRICT,
  assigned_at      timestamptz NOT NULL DEFAULT now(),
  pickup_damage    text
);

CREATE INDEX IF NOT EXISTS pickup_assignments_pickup_idx
  ON pickup_number_assignments (pickup_number_id);

ALTER TABLE sh_inventory
  ADD COLUMN IF NOT EXISTS pickup_damage text;
