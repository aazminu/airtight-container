import { describe, expect, it } from 'vitest';
import {
  CURRENT_SMS_CONSENT_VERSION,
  validateSmsConsent,
} from '../../lib/sms-consent.js';

describe('validateSmsConsent', () => {
  it('accepts the current version with attested=true', () => {
    const result = validateSmsConsent({
      attested: true,
      text_version: CURRENT_SMS_CONSENT_VERSION,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects missing payload', () => {
    const result = validateSmsConsent(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/required/i);
  });

  it('rejects null payload', () => {
    const result = validateSmsConsent(null);
    expect(result.ok).toBe(false);
  });

  it('rejects when attested is false', () => {
    const result = validateSmsConsent({
      attested: false,
      text_version: CURRENT_SMS_CONSENT_VERSION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/attestation is required/i);
  });

  it('rejects when attested is missing', () => {
    const result = validateSmsConsent({
      text_version: CURRENT_SMS_CONSENT_VERSION,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when text_version is missing', () => {
    const result = validateSmsConsent({ attested: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/text version/i);
  });

  it('rejects a stale text_version with a reload hint', () => {
    const result = validateSmsConsent({
      attested: true,
      text_version: 'v0-ancient',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/updated/i);
      expect(result.message).toMatch(/reload/i);
    }
  });

  it('rejects non-string text_version', () => {
    const result = validateSmsConsent({ attested: true, text_version: 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects "attested" string instead of boolean true', () => {
    // Guard against accidental client serialization bugs where
    // attested gets toggled to a truthy string. Only the literal
    // boolean true passes.
    const result = validateSmsConsent({
      attested: 'true',
      text_version: CURRENT_SMS_CONSENT_VERSION,
    });
    expect(result.ok).toBe(false);
  });
});
