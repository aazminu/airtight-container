// Canonical client phone format: `XXX-XXX-XXXX`, with any digits beyond the
// first ten rendered as ` EXT. <rest>`. This is a display/storage normalizer,
// not E.164 — see lib/sms.ts for the Twilio-facing form.
export function normalizePhone(input?: string | null): string | null {
  if (input == null) return null;
  const digits = String(input).replace(/\D/g, '');
  if (digits.length < 10) {
    const trimmed = String(input).trim();
    return trimmed === '' ? null : trimmed;
  }
  const base = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  const ext = digits.slice(10);
  return ext ? `${base} EXT. ${ext}` : base;
}
