-- Phase 9 PR 9.2 — mod_presets.default_price.
--
-- Adds an optional default price that the invoice editor / create flow
-- autofills into the modification_price field when the user picks a
-- matching preset description. Nullable; existing rows stay NULL until
-- admin sets a value. Autofill only fires when the price input is empty
-- so we don't clobber a typed-in number.

ALTER TABLE "mod_presets" ADD COLUMN IF NOT EXISTS "default_price" numeric;
