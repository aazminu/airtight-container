-- Phase 5 PR 5.1 — reports + mod_presets tables.
--
-- `reports` captures every generated report (delivery sheet, I/O,
-- P&L, per-client S&H statement). The PDF is rendered server-side
-- via the same Puppeteer pipeline as invoices and persisted to S3;
-- `pdf_s3_key` is null until the render succeeds.
--
-- `mod_presets` is the admin-editable backing store for the invoice
-- editor's modification-description <datalist>. Seeded with the four
-- presets that lived in client/src/components/forms/modificationPresets.ts.

CREATE TABLE IF NOT EXISTS "reports" (
    "id" serial PRIMARY KEY NOT NULL,
    "report_type" text NOT NULL,
    "generated_by" text,
    "generated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "parameters" jsonb,
    "pdf_s3_key" text,
    "emailed_to" text[]
);

-- Drop any pre-existing implicit FK left by an earlier drizzle-kit push
-- (local DBs may have one with the default action). Idempotent.
ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_generated_by_fkey";
ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_generated_by_fk";

ALTER TABLE "reports"
    ADD CONSTRAINT "reports_generated_by_fk"
    FOREIGN KEY ("generated_by") REFERENCES "public"."user"("id") ON DELETE SET NULL;

-- Normalize generated_at to NOT NULL — table-stub-from-drizzle-push may
-- have created it nullable; CREATE TABLE IF NOT EXISTS above skips when
-- it already exists.
ALTER TABLE "reports" ALTER COLUMN "generated_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "reports_type_idx"
    ON "reports" USING btree ("report_type");
CREATE INDEX IF NOT EXISTS "reports_generated_at_idx"
    ON "reports" USING btree ("generated_at");

CREATE TABLE IF NOT EXISTS "mod_presets" (
    "id" serial PRIMARY KEY NOT NULL,
    "label" text NOT NULL UNIQUE,
    "position" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "mod_presets_position_idx"
    ON "mod_presets" USING btree ("position");

INSERT INTO "mod_presets" ("label", "position") VALUES
    ('Installation of Rollup Door', 0),
    ('Paint Job', 1),
    ('Installation of Man Door', 2),
    ('Installation of Window', 3)
ON CONFLICT (label) DO NOTHING;
