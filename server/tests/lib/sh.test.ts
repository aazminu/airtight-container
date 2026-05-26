import { describe, it, expect } from 'vitest';
import { countStorageDays, storageDaysForMonth } from '../../lib/sh.js';

describe('countStorageDays', () => {
  it('returns 1 when arrival and checkout are the same day', () => {
    const d = new Date(2026, 0, 5);
    expect(countStorageDays(d, d)).toBe(1);
  });

  it('counts inclusive on both endpoints', () => {
    // Per PLAN §4.2 example: Jan 5 → Jan 8 = 4 days
    const start = new Date(2026, 0, 5);
    const end = new Date(2026, 0, 8);
    expect(countStorageDays(start, end)).toBe(4);
  });

  it('returns 0 if end is before start', () => {
    const start = new Date(2026, 0, 10);
    const end = new Date(2026, 0, 5);
    expect(countStorageDays(start, end)).toBe(0);
  });

  it('ignores time-of-day differences', () => {
    const start = new Date(2026, 0, 5, 23, 59);
    const end = new Date(2026, 0, 8, 0, 1);
    expect(countStorageDays(start, end)).toBe(4);
  });

  it('crosses month boundaries cleanly', () => {
    const start = new Date(2026, 0, 30); // Jan 30
    const end = new Date(2026, 1, 2);    // Feb 2 — Jan 30, 31, Feb 1, 2 = 4 days
    expect(countStorageDays(start, end)).toBe(4);
  });
});

describe('storageDaysForMonth', () => {
  it('counts in-month arrival, no checkout, full remaining month', () => {
    const intake = new Date(2026, 0, 5);
    // Jan 5 through Jan 31 inclusive = 27 days
    expect(storageDaysForMonth(intake, null, 2026, 0)).toBe(27);
  });

  it('counts pre-month arrival as starting on day 1 of the month', () => {
    const intake = new Date(2025, 11, 20);
    // Jan 1 through Jan 31 = 31 days
    expect(storageDaysForMonth(intake, null, 2026, 0)).toBe(31);
  });

  it('caps the count at the checkout date when checkout is during the month', () => {
    const intake = new Date(2025, 11, 20);
    const checkout = new Date(2026, 0, 10);
    // Jan 1 through Jan 10 = 10 days
    expect(storageDaysForMonth(intake, checkout, 2026, 0)).toBe(10);
  });

  it('returns 0 when checkout is before the month', () => {
    const intake = new Date(2025, 10, 1);
    const checkout = new Date(2025, 11, 31);
    expect(storageDaysForMonth(intake, checkout, 2026, 0)).toBe(0);
  });

  it('returns 0 when intake is after the month', () => {
    const intake = new Date(2026, 1, 5);
    expect(storageDaysForMonth(intake, null, 2026, 0)).toBe(0);
  });

  it('handles intake and checkout in the same month', () => {
    const intake = new Date(2026, 0, 5);
    const checkout = new Date(2026, 0, 8);
    expect(storageDaysForMonth(intake, checkout, 2026, 0)).toBe(4);
  });

  it('handles February (28 days) correctly', () => {
    const intake = new Date(2026, 0, 15);
    // Feb 1 through Feb 28 = 28 days
    expect(storageDaysForMonth(intake, null, 2026, 1)).toBe(28);
  });

  it('handles leap-year February (29 days) correctly', () => {
    const intake = new Date(2024, 0, 15);
    // Feb 1 through Feb 29 = 29 days
    expect(storageDaysForMonth(intake, null, 2024, 1)).toBe(29);
  });
});
