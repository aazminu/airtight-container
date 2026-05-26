import { describe, it, expect } from 'vitest';
import {
  damagePresetSchema,
  damagePresetUpdateSchema,
} from '../../validation/damage_presets.js';

describe('damagePresetSchema (create)', () => {
  it('accepts a basic label + default position', () => {
    const r = damagePresetSchema.safeParse({ label: 'New' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.position).toBe(0);
  });

  it('accepts an explicit position', () => {
    const r = damagePresetSchema.safeParse({ label: 'WWT', position: 1 });
    expect(r.success).toBe(true);
  });

  it('trims whitespace on the label', () => {
    const r = damagePresetSchema.safeParse({ label: '  As-is  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.label).toBe('As-is');
  });

  it('rejects an empty label', () => {
    expect(damagePresetSchema.safeParse({ label: '   ' }).success).toBe(false);
  });

  it('rejects a label over 120 chars', () => {
    expect(
      damagePresetSchema.safeParse({ label: 'x'.repeat(121) }).success,
    ).toBe(false);
  });

  it('rejects a negative position', () => {
    expect(
      damagePresetSchema.safeParse({ label: 'OK', position: -1 }).success,
    ).toBe(false);
  });
});

describe('damagePresetUpdateSchema (partial)', () => {
  it('allows updating just the label', () => {
    expect(
      damagePresetUpdateSchema.safeParse({ label: 'WWT' }).success,
    ).toBe(true);
  });

  it('allows updating just the position', () => {
    expect(
      damagePresetUpdateSchema.safeParse({ position: 7 }).success,
    ).toBe(true);
  });

  it('allows an empty patch (route enforces non-empty)', () => {
    expect(damagePresetUpdateSchema.safeParse({}).success).toBe(true);
  });
});
