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
      unit_number: 'ABCD1234567',
      size: '20ft',
      release_number_id: 7,
    },
  };

  it('accepts a minimal valid create (no customer, no rates)', () => {
    expect(createShInventorySchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a missing unit_number', () => {
    const r = createShInventorySchema.safeParse({
      box: { size: '20ft', release_number_id: 7 },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a missing release_number_id', () => {
    const r = createShInventorySchema.safeParse({
      box: { unit_number: 'ABCD1234567', size: '20ft' },
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

  it('strips legacy intake fields (client_id, rates)', () => {
    // Old callers may still send these; Zod strips unknown keys by
    // default, so the parse should succeed and ignore them.
    const r = createShInventorySchema.safeParse({
      box: { ...valid.box, client_id: 5, in_fee: '65', daily_rate: '1' },
    });
    expect(r.success).toBe(true);
  });
});

describe('auditShInventorySchema', () => {
  it('accepts in_out_daily with all three rates', () => {
    const r = auditShInventorySchema.safeParse({
      client_id: 1,
      billing_mode: 'in_out_daily',
      in_fee: '65',
      out_fee: '65',
      daily_rate: '1',
    });
    expect(r.success).toBe(true);
  });

  it('rejects in_out_daily missing a rate', () => {
    const r = auditShInventorySchema.safeParse({
      client_id: 1,
      billing_mode: 'in_out_daily',
      in_fee: '65',
      daily_rate: '1',
    });
    expect(r.success).toBe(false);
  });

  it('accepts flat_monthly with flat_rate', () => {
    const r = auditShInventorySchema.safeParse({
      client_id: 1,
      billing_mode: 'flat_monthly',
      flat_rate: '325',
    });
    expect(r.success).toBe(true);
  });

  it('rejects flat_monthly without flat_rate', () => {
    const r = auditShInventorySchema.safeParse({
      client_id: 1,
      billing_mode: 'flat_monthly',
    });
    expect(r.success).toBe(false);
  });

  it('accepts non_billable with no rates', () => {
    const r = auditShInventorySchema.safeParse({
      client_id: 1,
      billing_mode: 'non_billable',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing client_id', () => {
    const r = auditShInventorySchema.safeParse({
      billing_mode: 'non_billable',
    });
    expect(r.success).toBe(false);
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
