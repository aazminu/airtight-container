-- Phase 1 PR 1.6 — cutover migration. Irreversible.
-- Pair with a fresh pg_dump backup; this runs only after PR 1.3's
-- backfill has populated all the new FK columns and snapshot totals.
--
-- Verified preconditions (PR 1.3 final assertions):
--   * Every inventory row has non-NULL release_number_id and sale_company_id
--   * Every invoice has a non-NULL subtotal
--   * Every invoice_number is unique across the invoices table

-- ---- drop legacy tables -----------------------------------------

DROP TABLE IF EXISTS contacts;
--> statement-breakpoint

DROP TABLE IF EXISTS releases;
--> statement-breakpoint

-- Old hand-rolled users table — replaced by Better Auth's "user" table
-- (still present and managed by Better Auth itself).
DROP TABLE IF EXISTS users;
--> statement-breakpoint

-- ---- drop legacy text columns on inventory ----------------------
-- acceptance_number and sale_company are replaced by release_number_id /
-- sale_company_id FKs which PR 1.3 fully populated.

ALTER TABLE inventory DROP COLUMN acceptance_number;
--> statement-breakpoint

ALTER TABLE inventory DROP COLUMN sale_company;
--> statement-breakpoint

-- ---- tighten new FK columns to NOT NULL -------------------------

ALTER TABLE inventory ALTER COLUMN release_number_id SET NOT NULL;
--> statement-breakpoint

ALTER TABLE inventory ALTER COLUMN sale_company_id SET NOT NULL;
--> statement-breakpoint

-- ---- enforce invoice_number uniqueness --------------------------
-- PR 1.3 step 0 cleaned up the one historical duplicate that blocked this.
-- New invoice creation (Phase 3) will rely on this constraint + an
-- advisory lock for concurrency.

ALTER TABLE invoices
  ADD CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number);
