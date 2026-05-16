import { describe, it, expect } from 'vitest';
import {
  sizePresetSchema,
  sizePresetUpdateSchema,
} from '../../validation/size_presets.js';

describe('sizePresetSchema (create)', () => {
  it('accepts a basic label + default position', () => {
    const r = sizePresetSchema.safeParse({ label: "20'DV" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.position).toBe(0);
  });

  it('accepts an explicit position', () => {
    const r = sizePresetSchema.safeParse({ label: "40'HC", position: 5 });
    expect(r.success).toBe(true);
  });

  it('trims whitespace on the label', () => {
    const r = sizePresetSchema.safeParse({ label: "  10'DV  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.label).toBe("10'DV");
  });

  it('rejects an empty label', () => {
    expect(sizePresetSchema.safeParse({ label: '   ' }).success).toBe(false);
  });

  it('rejects a label over 120 chars', () => {
    expect(
      sizePresetSchema.safeParse({ label: 'x'.repeat(121) }).success,
    ).toBe(false);
  });

  it('rejects a negative position', () => {
    expect(
      sizePresetSchema.safeParse({ label: 'OK', position: -1 }).success,
    ).toBe(false);
  });
});

describe('sizePresetUpdateSchema (partial)', () => {
  it('allows updating just the label', () => {
    expect(
      sizePresetUpdateSchema.safeParse({ label: "45'HC" }).success,
    ).toBe(true);
  });

  it('allows updating just the position', () => {
    expect(
      sizePresetUpdateSchema.safeParse({ position: 2 }).success,
    ).toBe(true);
  });

  it('allows an empty patch (route enforces non-empty)', () => {
    expect(sizePresetUpdateSchema.safeParse({}).success).toBe(true);
  });
});
