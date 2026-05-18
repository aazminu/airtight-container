-- Track when a delivery sheet was last sent via SMS, parallel to the
-- existing emailed_at column. Only delivery_sheet reports populate this
-- in practice (the SMS send route is gated to that type) but the column
-- lives on reports for consistency with emailed_at.

ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "sms_sent_at" timestamptz;
