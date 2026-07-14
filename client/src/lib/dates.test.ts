import { describe, expect, it } from 'vitest';
import { easternDateToISO, isoToEasternDate, todayEastern } from './dates';

describe('isoToEasternDate', () => {
  it('formats a UTC timestamp to the Eastern calendar day', () => {
    // 2026-07-13 02:00 UTC = 2026-07-12 22:00 EDT
    expect(isoToEasternDate('2026-07-13T02:00:00.000Z')).toBe('2026-07-12');
  });

  it('passes a bare YYYY-MM-DD through unchanged', () => {
    expect(isoToEasternDate('2026-06-01')).toBe('2026-06-01');
  });

  it('returns empty string for nullish/invalid input', () => {
    expect(isoToEasternDate(null)).toBe('');
    expect(isoToEasternDate('')).toBe('');
    expect(isoToEasternDate('not-a-date')).toBe('');
  });
});

describe('easternDateToISO', () => {
  it('maps a picked calendar day to noon UTC (same day everywhere in the US)', () => {
    expect(easternDateToISO('2026-06-01')).toBe('2026-06-01T12:00:00.000Z');
  });

  it('round-trips back to the same Eastern day (no off-by-one)', () => {
    const iso = easternDateToISO('2026-06-01');
    expect(iso).not.toBeNull();
    expect(isoToEasternDate(iso)).toBe('2026-06-01');
  });

  it('returns null for empty input', () => {
    expect(easternDateToISO('')).toBeNull();
    expect(easternDateToISO(null)).toBeNull();
  });
});

describe('todayEastern', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayEastern()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
