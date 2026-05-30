import { describe, it, expect } from 'vitest';
import {
  createPickupSchema,
  shOutboundSchema,
} from '../../validation/pickup.js';

describe('createPickupSchema', () => {
  it('accepts a well-formed body', () => {
    expect(
      createPickupSchema.safeParse({
        company_id: 1,
        number: 'PU-123',
        pickup_count: 10,
      }).success,
    ).toBe(true);
  });

  it('coerces stringy ids and counts', () => {
    const r = createPickupSchema.safeParse({
      company_id: '1',
      number: 'PU-123',
      pickup_count: '5',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.company_id).toBe(1);
      expect(r.data.pickup_count).toBe(5);
    }
  });

  it('rejects pickup_count < 1', () => {
    expect(
      createPickupSchema.safeParse({
        company_id: 1,
        number: 'PU-123',
        pickup_count: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects empty number', () => {
    expect(
      createPickupSchema.safeParse({
        company_id: 1,
        number: '   ',
        pickup_count: 5,
      }).success,
    ).toBe(false);
  });
});

describe('shOutboundSchema', () => {
  it('accepts a single-box batch', () => {
    expect(
      shOutboundSchema.safeParse({
        pickup_number_id: 1,
        outbound_date: '2026-05-29T17:00:00.000Z',
        boxes: [{ sh_inventory_id: 100, pickup_damage: 'Top dent' }],
      }).success,
    ).toBe(true);
  });

  it('accepts a multi-box batch with default damage omitted', () => {
    const r = shOutboundSchema.safeParse({
      pickup_number_id: 1,
      outbound_date: '2026-05-29T17:00:00.000Z',
      boxes: [
        { sh_inventory_id: 100 },
        { sh_inventory_id: 101, pickup_damage: 'Out good' },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty boxes array', () => {
    expect(
      shOutboundSchema.safeParse({
        pickup_number_id: 1,
        outbound_date: '2026-05-29T17:00:00.000Z',
        boxes: [],
      }).success,
    ).toBe(false);
  });

  it('rejects > 200 boxes', () => {
    const boxes = Array.from({ length: 201 }, (_, i) => ({
      sh_inventory_id: i + 1,
    }));
    expect(
      shOutboundSchema.safeParse({
        pickup_number_id: 1,
        outbound_date: '2026-05-29T17:00:00.000Z',
        boxes,
      }).success,
    ).toBe(false);
  });
});
