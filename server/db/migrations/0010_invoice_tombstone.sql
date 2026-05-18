-- Invoice tombstone: deleting an invoice leaves the row in place with
-- `deleted_at` set, so the YYYYMM sequence stays contiguous and the
-- operator can see that the gap is intentional. The underlying sold
-- rows + container links are still cascaded away (the boxes weren't
-- actually sold), and `pdf_s3_key` is cleared since the cached PDF no
-- longer reflects truth. NULL `deleted_at` = active invoice.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
