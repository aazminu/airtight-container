// Unit tests for lib/quote-number.ts. These use a fake PoolClient so
// they exercise the number-building / lock-acquisition logic without
// touching a real database.

import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { easternMonthPrefix, getNextQuoteNumber } from '../../lib/quote-number.js';

// Minimal fake: records every query and returns a canned MAX(suffix)
// for the sequence SELECT. The advisory-lock SELECT returns nothing.
function fakeClient(maxSuffix: number): {
  client: PoolClient;
  queries: string[];
} {
  const queries: string[] = [];
  const query = vi.fn(async (text: string) => {
    queries.push(text);
    if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
    // The sequence SELECT computes COALESCE(MAX(...), 0) + 1.
    return { rows: [{ next: maxSuffix + 1 }] };
  });
  return { client: { query } as unknown as PoolClient, queries };
}

describe('easternMonthPrefix', () => {
  it('formats YYYYMM in Eastern time', () => {
    // Noon UTC is mid-morning ET — same calendar day, no rollover risk.
    expect(easternMonthPrefix(new Date('2026-03-15T12:00:00Z'))).toBe('202603');
    expect(easternMonthPrefix(new Date('2026-11-01T17:00:00Z'))).toBe('202611');
  });

  it('rolls to the prior month when ET is still the last day', () => {
    // 2026-04-01 02:00 UTC = 2026-03-31 22:00 ET → still March.
    expect(easternMonthPrefix(new Date('2026-04-01T02:00:00Z'))).toBe('202603');
  });
});

describe('getNextQuoteNumber', () => {
  it('acquires the advisory lock before reading the sequence', async () => {
    const { client, queries } = fakeClient(0);
    await getNextQuoteNumber(client, '202605');
    expect(queries[0]).toContain('pg_advisory_xact_lock');
    expect(queries[1]).toContain('quote_number LIKE');
  });

  it('returns Q-YYYYMM-0001 for a month with no quotes', async () => {
    const { client } = fakeClient(0);
    const n = await getNextQuoteNumber(client, '202605');
    expect(n).toBe('Q-202605-0001');
  });

  it('zero-pads the suffix to 4 digits and increments the max', async () => {
    const { client } = fakeClient(9);
    const n = await getNextQuoteNumber(client, '202605');
    expect(n).toBe('Q-202605-0010');
  });

  it('throws when the monthly suffix is exhausted at 9999', async () => {
    const { client } = fakeClient(9999);
    await expect(getNextQuoteNumber(client, '202605')).rejects.toThrow(
      /exhausted/,
    );
  });
});
