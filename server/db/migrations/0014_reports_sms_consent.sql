-- A2P 10DLC compliance: capture operator-attested consent before any
-- SMS send. The Twilio campaign requires auditable proof that the
-- driver gave consent at the point their phone number was collected;
-- yard handoff is verbal, so the operator attests on the driver's
-- behalf via a required checkbox in the Send-to-Driver dialog.
--
-- Three columns on `reports`:
--   sms_consent_at           — when the attestation was recorded
--   sms_consent_by_user_id   — which operator clicked the checkbox
--                              (text to match better-auth user.id)
--   sms_consent_text_version — version stamp of the disclosure text
--                              they were shown; bump in code when the
--                              wording changes and existing rows
--                              still tell us what they agreed to.
--
-- The send route refuses to dispatch SMS without all three set.

ALTER TABLE "reports"
  ADD COLUMN IF NOT EXISTS "sms_consent_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "sms_consent_by_user_id" text,
  ADD COLUMN IF NOT EXISTS "sms_consent_text_version" text;
