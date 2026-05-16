-- Phase 9 PR 9.1 — size + damage admin-editable preset tables.
--
-- Mirrors `mod_presets` (id, label UNIQUE, position, created_at). The
-- intake forms and InventoryEditor swap their freetext size/damage inputs
-- for <input list> sourced from these tables. We keep `inventory.size`,
-- `inventory.damage`, `sh_inventory.size`, `sh_inventory.damage` as `text`
-- — no FK — so a deleted preset doesn't strand historical rows and the
-- label history stays intact even after admin CRUD churn.
--
-- Inline fold: existing `damage = 'NA'` rows (23 today on inventory) map
-- to the closest preset 'As-is'. Other freetext outliers (case variants
-- like 'NEW'/'wwt', the 14 bare `20'` rows, the 3 `45'HC` rows, blanks,
-- one-off custom strings) are left as legacy text — user reviews via the
-- admin UI or a future CSV-review backfill.

CREATE TABLE IF NOT EXISTS "size_presets" (
    "id" serial PRIMARY KEY NOT NULL,
    "label" text NOT NULL UNIQUE,
    "position" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "size_presets_position_idx"
    ON "size_presets" USING btree ("position");

INSERT INTO "size_presets" ("label", "position") VALUES
    ('10''DV', 0),
    ('10''HC', 1),
    ('20''DV', 2),
    ('20''HC', 3),
    ('40''DV', 4),
    ('40''HC', 5),
    ('45''HC', 6)
ON CONFLICT (label) DO NOTHING;

CREATE TABLE IF NOT EXISTS "damage_presets" (
    "id" serial PRIMARY KEY NOT NULL,
    "label" text NOT NULL UNIQUE,
    "position" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "damage_presets_position_idx"
    ON "damage_presets" USING btree ("position");

INSERT INTO "damage_presets" ("label", "position") VALUES
    ('New', 0),
    ('WWT', 1),
    ('As-is', 2)
ON CONFLICT (label) DO NOTHING;

-- One-shot fold: the 23 inventory rows + any sh_inventory rows with
-- damage='NA' get the closest standardized label.
UPDATE "inventory" SET "damage" = 'As-is' WHERE "damage" = 'NA';
UPDATE "sh_inventory" SET "damage" = 'As-is' WHERE "damage" = 'NA';
