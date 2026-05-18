import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { _resetForTests, isSmsConfigured, toE164 } from '../../lib/sms.js';

const ENV_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_MESSAGING_SERVICE_SID',
  'TWILIO_FROM_NUMBER',
] as const;

describe('toE164', () => {
  it('formats common US 10-digit inputs', () => {
    expect(toE164('7328614011')).toBe('+17328614011');
    expect(toE164('732-861-4011')).toBe('+17328614011');
    expect(toE164('(732) 861-4011')).toBe('+17328614011');
    expect(toE164('732.861.4011')).toBe('+17328614011');
  });

  it('passes through already-E.164 inputs (strips internal whitespace)', () => {
    expect(toE164('+17328614011')).toBe('+17328614011');
    expect(toE164('+1 732 861 4011')).toBe('+17328614011');
  });

  it('handles 11-digit form starting with 1', () => {
    expect(toE164('17328614011')).toBe('+17328614011');
    expect(toE164('1-732-861-4011')).toBe('+17328614011');
  });

  it('returns input unchanged when it cannot be normalized', () => {
    // Twilio will reject these with a clear error — we don't try to be
    // cleverer than the carrier here.
    expect(toE164('not a phone')).toBe('not a phone');
    expect(toE164('123')).toBe('123');
  });
});

describe('isSmsConfigured', () => {
  let snapshot: Record<string, string | undefined>;

  beforeEach(() => {
    snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    _resetForTests();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
    _resetForTests();
  });

  it('returns false when no creds are set', () => {
    expect(isSmsConfigured()).toBe(false);
  });

  it('returns false when only creds are set but no sender', () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxx';
    process.env.TWILIO_AUTH_TOKEN = 'shhh';
    expect(isSmsConfigured()).toBe(false);
  });

  it('returns true with creds + messaging service SID', () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxx';
    process.env.TWILIO_AUTH_TOKEN = 'shhh';
    process.env.TWILIO_MESSAGING_SERVICE_SID = 'MGxxxx';
    expect(isSmsConfigured()).toBe(true);
  });

  it('returns true with creds + From number fallback', () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxx';
    process.env.TWILIO_AUTH_TOKEN = 'shhh';
    process.env.TWILIO_FROM_NUMBER = '+15551234567';
    expect(isSmsConfigured()).toBe(true);
  });
});
