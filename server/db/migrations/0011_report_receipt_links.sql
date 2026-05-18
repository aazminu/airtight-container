-- Public receipt-link tokens for delivery sheets.
--
-- A row is issued each time the operator hits Send-to-Driver SMS/email on
-- a delivery sheet. The token (16 random bytes, base64url-encoded → ~22
-- chars) goes in the URL — anyone with the link gets a fresh presigned
-- S3 redirect to that delivery sheet's PDF. Tokens auto-expire after 30
-- days; the operator can also revoke manually from the ReportDetail UI
-- if a wrong number was used.
--
-- ON DELETE CASCADE against reports.id means deleting a delivery sheet
-- automatically invalidates its outstanding receipt links.

CREATE TABLE IF NOT EXISTS "report_receipt_links" (
  "id"           serial PRIMARY KEY,
  "token"        text UNIQUE NOT NULL,
  "report_id"    integer NOT NULL REFERENCES "reports"("id") ON DELETE CASCADE,
  "created_at"   timestamptz NOT NULL DEFAULT NOW(),
  "expires_at"   timestamptz NOT NULL DEFAULT (NOW() + interval '30 days'),
  "accessed_at"  timestamptz,
  "revoked_at"   timestamptz
);

CREATE INDEX IF NOT EXISTS "report_receipt_links_token_idx"
  ON "report_receipt_links"("token");
CREATE INDEX IF NOT EXISTS "report_receipt_links_report_id_idx"
  ON "report_receipt_links"("report_id");
