import { describe, it, expect } from 'vitest';
import { auditInventorySchema } from '../../validation/inventory.js';

describe('auditInventorySchema', () => {
  it('accepts an empty body (no changes — just clears the flag)', () => {
    expect(auditInventorySchema.safeParse({}).success).toBe(true);
  });

  it('accepts an acquisition_price override as string', () => {
    const r = auditInventorySchema.safeParse({ acquisition_price: '2350.00' });
    expect(r.success).toBe(true);
  });

  it('accepts an acquisition_price override as number', () => {
    const r = auditInventorySchema.safeParse({ acquisition_price: 2350 });
    expect(r.success).toBe(true);
  });

  it('rejects negative acquisition_price', () => {
    const r = auditInventorySchema.safeParse({ acquisition_price: '-5' });
    expect(r.success).toBe(false);
  });

  it('accepts an ISO date override', () => {
    const r = auditInventorySchema.safeParse({
      date: '2026-05-01T08:00:00.000Z',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a non-ISO date', () => {
    const r = auditInventorySchema.safeParse({ date: 'last Tuesday' });
    expect(r.success).toBe(false);
  });

  it('accepts a notes string', () => {
    const r = auditInventorySchema.safeParse({ notes: 'Minor dent rear door' });
    expect(r.success).toBe(true);
  });
});
