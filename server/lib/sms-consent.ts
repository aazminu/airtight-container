// Single source of truth for the SMS-consent text version the server
// will accept on POST /api/v2/report/:id/sms.
//
// The client renders the disclosure text in the Send-to-Driver dialog
// and submits the version string alongside the operator attestation;
// the server refuses to dispatch if the version doesn't match. Bumping
// this constant (e.g. when legal asks for new wording) forces every
// open dialog to re-render before the next send goes through.

export const CURRENT_SMS_CONSENT_VERSION = 'v1-2026-05-25';

export interface SmsConsentPayload {
  attested: boolean;
  text_version: string;
}

// Returns null when the payload is acceptable, an error message string
// when it should be rejected.
export function validateSmsConsent(
  payload: unknown,
): { ok: true } | { ok: false; message: string } {
  if (payload === null || typeof payload !== 'object') {
    return {
      ok: false,
      message:
        'SMS consent attestation is required before this message can be sent.',
    };
  }
  const p = payload as Record<string, unknown>;
  if (p.attested !== true) {
    return {
      ok: false,
      message:
        'SMS consent attestation is required before this message can be sent.',
    };
  }
  if (typeof p.text_version !== 'string' || !p.text_version) {
    return {
      ok: false,
      message: 'SMS consent text version is required.',
    };
  }
  if (p.text_version !== CURRENT_SMS_CONSENT_VERSION) {
    return {
      ok: false,
      message:
        'The SMS consent language has been updated. Reload the page and re-attest before sending.',
    };
  }
  return { ok: true };
}
