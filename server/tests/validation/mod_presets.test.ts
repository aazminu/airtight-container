import { describe, it, expect } from 'vitest';
import {
  modPresetSchema,
  modPresetUpdateSchema,
} from '../../validation/mod_presets.js';

describe('modPresetSchema (create)', () => {
  it('accepts a basic label + default position', () => {
    const r = modPresetSchema.safeParse({ label: 'Installation of Lock' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.position).toBe(0);
  });

  it('accepts an explicit position', () => {
    const r = modPresetSchema.safeParse({ label: 'Paint Job', position: 3 });
    expect(r.success).toBe(true);
  });

  it('trims whitespace on the label', () => {
    const r = modPresetSchema.safeParse({ label: '  Paint Job  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.label).toBe('Paint Job');
  });

  it('rejects an empty label', () => {
    expect(modPresetSchema.safeParse({ label: '   ' }).success).toBe(false);
  });

  it('rejects a label over 120 chars', () => {
    expect(
      modPresetSchema.safeParse({ label: 'x'.repeat(121) }).success,
    ).toBe(false);
  });

  it('rejects a negative position', () => {
    expect(
      modPresetSchema.safeParse({ label: 'OK', position: -1 }).success,
    ).toBe(false);
  });
});

describe('modPresetUpdateSchema (partial)', () => {
  it('allows updating just the label', () => {
    expect(
      modPresetUpdateSchema.safeParse({ label: 'New Label' }).success,
    ).toBe(true);
  });

  it('allows updating just the position', () => {
    expect(
      modPresetUpdateSchema.safeParse({ position: 5 }).success,
    ).toBe(true);
  });

  it('allows an empty patch (route enforces non-empty)', () => {
    expect(modPresetUpdateSchema.safeParse({}).success).toBe(true);
  });
});
