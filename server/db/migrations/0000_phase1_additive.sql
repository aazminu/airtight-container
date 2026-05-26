-- Phase 1 PR 1.2 — additive migration for schema 2.0.
-- Adds new enums, tables, columns, and indexes; tightens non-destructive
-- type and default quirks on existing columns. Does NOT drop legacy
-- tables/columns, does NOT enforce new NOT NULL FK constraints, does
-- NOT add the UNIQUE(invoice_number) constraint — those land in PR 1.6
-- once PR 1.3's backfill has populated the new columns.

-- ---- enums --------------------------------------------------------

CREATE TYPE inventory_state AS ENUM ('pending', 'available', 'hold', 'sold', 'outbound');
--> statement-breakpoint

CREATE TYPE sh_state AS ENUM ('pending', 'in_storage', 'checked_out');
--> statement-breakpoint

CREATE TYPE sh_invoice_status AS ENUM ('pending_review', 'sent', 'paid');
--> statement-breakpoint

CREATE TYPE sh_line_type AS ENUM ('in_fee', 'out_fee', 'storage_days');
--> statement-breakpoint

-- ---- clients (new; backfilled from contacts in PR 1.3) ------------

CREATE TABLE clients (
  id serial PRIMARY KEY,
  client_name text NOT NULL,
  business_name text,
  contact_email text,
  contact_phone text,
  street text,
  city text,
  state text,
  zip text,
  default_in_fee numeric NOT NULL DEFAULT 65,
  default_out_fee numeric NOT NULL DEFAULT 65,
  default_daily_rate numeric NOT NULL DEFAULT 1
);
--> statement-breakpoint

-- ---- release_number_containers (new) ------------------------------

CREATE TABLE release_number_containers (
  release_number_id integer NOT NULL REFERENCES release_numbers(release_number_id) ON DELETE CASCADE,
  container_number text NOT NULL,
  is_used boolean NOT NULL DEFAULT false,
  PRIMARY KEY (release_number_id, container_number)
);
--> statement-breakpoint

-- ---- inventory (new cols + non-destructive type cleanups) --------
-- NOTE: the aquisition_price → acquisition_price rename here will break
-- inventory.js's raw-SQL POST/PUT routes (which still reference the typo)
-- until PR 1.4 ports them. PR 0.2's Drizzle GET / route already expects
-- acquisition_price via schema.ts, so the rename is the consistent move.

ALTER TABLE inventory RENAME COLUMN aquisition_price TO acquisition_price;
--> statement-breakpoint

ALTER TABLE inventory ALTER COLUMN unit_number TYPE text USING trim(unit_number);
--> statement-breakpoint

ALTER TABLE inventory ALTER COLUMN size TYPE text USING trim(size);
--> statement-breakpoint

ALTER TABLE inventory ALTER COLUMN damage TYPE text;
--> statement-breakpoint

ALTER TABLE inventory ALTER COLUMN trucking_company TYPE text;
--> statement-breakpoint

ALTER TABLE inventory ALTER COLUMN notes TYPE text;
--> statement-breakpoint

ALTER TABLE inventory ALTER COLUMN state DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE inventory ALTER COLUMN state TYPE inventory_state USING state::inventory_state;
--> statement-breakpoint

ALTER TABLE inventory ALTER COLUMN state SET DEFAULT 'available';
--> statement-breakpoint

ALTER TABLE inventory ADD COLUMN is_pending_audit boolean NOT NULL DEFAULT true;
--> statement-breakpoint

ALTER TABLE inventory ADD COLUMN release_number_id integer REFERENCES release_numbers(release_number_id);
--> statement-breakpoint

ALTER TABLE inventory ADD COLUMN sale_company_id integer REFERENCES sale_companies(sale_company_id);
--> statement-breakpoint

CREATE INDEX inventory_state_idx ON inventory (state);
--> statement-breakpoint

CREATE INDEX inventory_pending_audit_idx ON inventory (is_pending_audit);
--> statement-breakpoint

-- ---- sold (new cols + drop sentinels/defaults + type cleanups) ---

ALTER TABLE sold ADD COLUMN material_cost numeric;
--> statement-breakpoint

ALTER TABLE sold ADD COLUMN labor_cost numeric;
--> statement-breakpoint

ALTER TABLE sold ALTER COLUMN modification_price DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE sold ALTER COLUMN outbound_date DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE sold ALTER COLUMN outbound_date DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE sold ALTER COLUMN outbound_trucker TYPE text;
--> statement-breakpoint

ALTER TABLE sold ALTER COLUMN destination TYPE text;
--> statement-breakpoint

ALTER TABLE sold ALTER COLUMN release_number TYPE text;
--> statement-breakpoint

ALTER TABLE sold ALTER COLUMN invoice_notes TYPE text;
--> statement-breakpoint

ALTER TABLE sold ALTER COLUMN invoice_notes DROP DEFAULT;
--> statement-breakpoint

-- ---- invoices (additive cols; rename/UNIQUE/FK swap in PR 1.6) ---

ALTER TABLE invoices ADD COLUMN subtotal numeric;
--> statement-breakpoint

ALTER TABLE invoices ADD COLUMN tax_rate numeric;
--> statement-breakpoint

ALTER TABLE invoices ADD COLUMN tax_amount numeric;
--> statement-breakpoint

ALTER TABLE invoices ADD COLUMN cc_fee_rate numeric;
--> statement-breakpoint

ALTER TABLE invoices ADD COLUMN cc_fee_amount numeric;
--> statement-breakpoint

ALTER TABLE invoices ADD COLUMN total numeric;
--> statement-breakpoint

ALTER TABLE invoices ADD COLUMN pdf_s3_key text;
--> statement-breakpoint

ALTER TABLE invoices ADD COLUMN sent_at timestamptz;
--> statement-breakpoint

CREATE INDEX invoices_invoice_date_idx ON invoices (invoice_date);
--> statement-breakpoint

-- ---- release_numbers (new cols + type cleanup) -------------------

ALTER TABLE release_numbers ADD COLUMN is_complete boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE release_numbers ADD COLUMN completed_at timestamptz;
--> statement-breakpoint

ALTER TABLE release_numbers ALTER COLUMN release_number_value TYPE text;
--> statement-breakpoint

-- ---- sale_companies (type cleanup) -------------------------------

ALTER TABLE sale_companies ALTER COLUMN sale_company_name TYPE text;
--> statement-breakpoint

-- ---- sh_inventory (new) ------------------------------------------

CREATE TABLE sh_inventory (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id),
  unit_number text NOT NULL,
  size text NOT NULL,
  damage text,
  intake_date timestamptz NOT NULL DEFAULT now(),
  in_fee numeric NOT NULL,
  out_fee numeric NOT NULL,
  daily_rate numeric NOT NULL,
  state sh_state NOT NULL DEFAULT 'pending',
  is_pending_audit boolean NOT NULL DEFAULT true,
  checkout_date timestamptz,
  notes text,
  photos text[]
);
--> statement-breakpoint

CREATE INDEX sh_inventory_state_idx ON sh_inventory (state);
--> statement-breakpoint

CREATE INDEX sh_inventory_pending_audit_idx ON sh_inventory (is_pending_audit);
--> statement-breakpoint

CREATE INDEX sh_inventory_client_idx ON sh_inventory (client_id);
--> statement-breakpoint

-- ---- sh_invoices (new) -------------------------------------------

CREATE TABLE sh_invoices (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id),
  billing_month date NOT NULL,
  invoice_number integer NOT NULL UNIQUE,
  subtotal numeric,
  tax_rate numeric,
  tax_amount numeric,
  total numeric,
  pdf_s3_key text,
  status sh_invoice_status NOT NULL DEFAULT 'pending_review',
  generated_at timestamptz,
  sent_at timestamptz
);
--> statement-breakpoint

CREATE UNIQUE INDEX sh_invoices_client_month_uniq ON sh_invoices (client_id, billing_month);
--> statement-breakpoint

-- ---- sh_invoice_lines (new) --------------------------------------

CREATE TABLE sh_invoice_lines (
  id serial PRIMARY KEY,
  sh_invoice_id integer NOT NULL REFERENCES sh_invoices(id) ON DELETE CASCADE,
  sh_box_id integer NOT NULL REFERENCES sh_inventory(id),
  line_type sh_line_type NOT NULL,
  days_count integer,
  rate numeric,
  amount numeric,
  description text
);
--> statement-breakpoint

-- ---- reports (new) -----------------------------------------------

CREATE TABLE reports (
  id serial PRIMARY KEY,
  report_type text NOT NULL,
  generated_by text REFERENCES "user"(id),
  generated_at timestamptz DEFAULT now(),
  parameters jsonb,
  pdf_s3_key text,
  emailed_to text[]
);
