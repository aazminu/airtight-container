-- Phase 1 PR 1.4 — rename invoices.contact_id → client_id, swap FK to clients.
-- Atomic with the v2/invoice.js route port: schema.ts already uses
-- client_id, but the DB still has contact_id from the legacy schema.
-- PR 1.3 backfilled `clients` with id values matching the original
-- contacts.contact_id values, so the numeric column data is already
-- valid against the new FK target.

ALTER TABLE invoices DROP CONSTRAINT invoices_contact_id_fkey;
--> statement-breakpoint

ALTER TABLE invoices RENAME COLUMN contact_id TO client_id;
--> statement-breakpoint

ALTER TABLE invoices ADD CONSTRAINT invoices_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
