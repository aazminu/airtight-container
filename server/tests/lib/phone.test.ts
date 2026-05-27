import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../../lib/phone.js';

describe('normalizePhone', () => {
  it('formats a bare 10-digit string', () => {
    expect(normalizePhone('5551234567')).toBe('555-123-4567');
  });

  it('strips punctuation and formats', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('555-123-4567');
  });

  it('appends an extension for extra digits', () => {
    expect(normalizePhone('(555) 123-4567 x1234')).toBe('555-123-4567 EXT. 1234');
  });

  it('is idempotent on already-canonical values', () => {
    expect(normalizePhone('555-123-4567')).toBe('555-123-4567');
    expect(normalizePhone('555-123-4567 EXT. 1234')).toBe('555-123-4567 EXT. 1234');
  });

  it('returns null for empty/nullish input', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it('leaves sub-10-digit input untouched (trimmed)', () => {
    expect(normalizePhone('ext 5')).toBe('ext 5');
  });
});
