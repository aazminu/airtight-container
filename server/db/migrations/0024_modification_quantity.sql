-- Quantity on modification line items (2026-06-06). "4x windows" etc.
-- Both modification tables get a quantity that multiplies the unit price
-- into the line total. Default 1 so every existing row keeps its current
-- (price x 1) behavior. Additive + idempotent.

ALTER TABLE quote_line_modifications
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

ALTER TABLE sold_modifications
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
