-- Phase 2 PR 2.6 — adds the photos column to sales inventory so the
-- intake flow can persist a list of S3 keys per box (first key is the
-- OCR target by convention). sh_inventory.photos already exists from
-- PR 1.2's additive migration.

ALTER TABLE inventory ADD COLUMN photos text[];
