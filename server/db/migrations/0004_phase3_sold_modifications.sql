-- Phase 3 PR 3.4 — per-modification line items.
-- Each row is one sub-row under its container's primary line in the
-- invoice template. Ordered by `position` (gappy on insert, normalized
-- by the server on edit). Legacy `sold.modification_price` stays as a
-- fallback for invoices that pre-date this migration — never
-- backfilled per owner.

CREATE TABLE IF NOT EXISTS "sold_modifications" (
    "id" serial PRIMARY KEY NOT NULL,
    "sold_id" integer NOT NULL,
    "description" text NOT NULL,
    "price" numeric NOT NULL,
    "position" integer NOT NULL DEFAULT 0
);

ALTER TABLE "sold_modifications"
    ADD CONSTRAINT "sold_modifications_sold_id_fk"
    FOREIGN KEY ("sold_id") REFERENCES "public"."sold"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "sold_modifications_sold_idx"
    ON "sold_modifications" USING btree ("sold_id");
