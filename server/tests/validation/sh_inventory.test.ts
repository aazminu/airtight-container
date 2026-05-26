import { describe, it, expect } from 'vitest';
import {
  createShInventorySchema,
  auditShInventorySchema,
  checkoutShInventorySchema,
  allowedNextStates,
} from '../../validation/sh_inventory.js';

describe('createShInventorySchema', () => {
  const valid = {
    box: {
      client_id: 1,
      unit_number: 'ABCD1234567',
      size: '20ft',
      in_fee: '65',
      out_fee: '65',
      daily_rate: '1',
    },
  };

  it('accepts a minimal valid create', () => {
    const r = createShInventorySchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('rejects a missing client_id', () => {
    const r = createShInventorySchema.safeParse({ box: { ...valid.box, client_id: undefined } });
    expect(r.success).toBe(false);
  });

  it('rejects a non-numeric fee', () => {
    const r = createShInventorySchema.safeParse({
      box: { ...valid.box, in_fee: 'free' },
    });
    expect(r.success).toBe(false);
  });

  it('accepts numeric fees as strings and coerces decimals', () => {
    const r = createShInventorySchema.safeParse({
      box: { ...valid.box, in_fee: '65.50', out_fee: 70, daily_rate: '0.75' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects negative fees', () => {
    const r = createShInventorySchema.safeParse({
      box: { ...valid.box, daily_rate: '-1' },
    });
    expect(r.success).toBe(false);
  });

  it('accepts optional intake_date and damage', () => {
    const r = createShInventorySchema.safeParse({
      box: {
        ...valid.box,
        intake_date: '2026-05-12T10:00:00.000Z',
        damage: 'Minor dent',
      },
    });
    expect(r.success).toBe(true);
  });
});

describe('auditShInventorySchema', () => {
  it('accepts an empty body (no changes)', () => {
    expect(auditShInventorySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a partial fee override', () => {
    expect(auditShInventorySchema.safeParse({ daily_rate: '1.50' }).success).toBe(true);
  });
});

describe('checkoutShInventorySchema', () => {
  it('requires checkout_date as ISO string', () => {
    expect(
      checkoutShInventorySchema.safeParse({ checkout_date: '2026-05-12T10:00:00.000Z' }).success,
    ).toBe(true);
  });

  it('rejects a non-ISO checkout_date', () => {
    expect(checkoutShInventorySchema.safeParse({ checkout_date: 'yesterday' }).success).toBe(false);
  });
});

describe('allowedNextStates', () => {
  it('allows pending → in_storage', () => {
    expect(allowedNextStates('pending')).toEqual(['in_storage']);
  });

  it('allows in_storage → checked_out', () => {
    expect(allowedNextStates('in_storage')).toEqual(['checked_out']);
  });

  it('forbids any transition out of checked_out', () => {
    expect(allowedNextStates('checked_out')).toEqual([]);
  });
});
