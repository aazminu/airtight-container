-- Quotes: a first-class estimate document. Functionally "an invoice
-- without containers" — a client + free-text line items (description +
-- price) + per-line modifications + tax/cc settings + snapshot totals.
-- It is editable, emailable, printable as a "Quote", and never consumes
-- inventory (no inventory.state flips, no sold rows). A quote can later
-- spawn a real invoice ("promote"), but that path is deferred — see the
-- TODO in server/routes/v2/quote.js.
--
-- Numbering: Q-YYYYMM-NNNN, monthly reset, Eastern time, sequenced via
-- a DISTINCT advisory lock from invoices/delivery-sheets (see
-- server/lib/quote-number.ts). Stored as text since the prefix is
-- alphanumeric, unlike the integer invoice_number sequence.
--
-- Status is a lightweight two-state text column ('draft' | 'sent')
-- rather than the full invoice lifecycle enum — a quote has no AR
-- lifecycle (no paid/delinquent). 'sent' is stamped when emailed.
--
-- deleted_at mirrors the invoice soft-delete tombstone (PR 9.5): the
-- row stays so its quote_number keeps its slot in the month's sequence.

CREATE TABLE IF NOT EXISTS "quotes" (
  "id" serial PRIMARY KEY,
  "quote_number" text NOT NULL UNIQUE,
  "client_id" integer NOT NULL REFERENCES "clients" ("id") ON DELETE CASCADE,
  "quote_taxed" boolean NOT NULL DEFAULT false,
  "quote_credit" boolean NOT NULL DEFAULT false,
  "tax_rate" numeric,
  "cc_fee_rate" numeric,
  "subtotal" numeric,
  "tax_amount" numeric,
  "cc_fee_amount" numeric,
  "total" numeric,
  "notes" text,
  "status" text NOT NULL DEFAULT 'draft',
  "pdf_s3_key" text,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "quotes_client_idx" ON "quotes" ("client_id");
CREATE INDEX IF NOT EXISTS "quotes_created_at_idx" ON "quotes" ("created_at");

-- Each quote line is a free-text item (no inventory FK — that's the
-- whole point of a quote vs. an invoice). trucking_rate is an optional
-- per-line delivery charge mirroring sold.trucking_rate; it renders as
-- a sub-row in the template just like on an invoice.
CREATE TABLE IF NOT EXISTS "quote_line_items" (
  "id" serial PRIMARY KEY,
  "quote_id" integer NOT NULL REFERENCES "quotes" ("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "sale_price" numeric,
  "trucking_rate" numeric,
  "destination" text,
  "position" integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "quote_line_items_quote_idx" ON "quote_line_items" ("quote_id");

-- Per-line modifications, mirroring sold_modifications: ordered by
-- position, cascade-deleted with their parent line. Each becomes a
-- sub-row beneath its line in the quote template.
CREATE TABLE IF NOT EXISTS "quote_line_modifications" (
  "id" serial PRIMARY KEY,
  "quote_line_item_id" integer NOT NULL
    REFERENCES "quote_line_items" ("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "price" numeric NOT NULL,
  "position" integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "quote_line_modifications_line_idx"
  ON "quote_line_modifications" ("quote_line_item_id");
