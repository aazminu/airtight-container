import { describe, it, expect } from 'vitest';
import { presignSchema, ocrSchema } from '../../validation/intake.js';

describe('presignSchema', () => {
  it('accepts a JPEG sales upload', () => {
    expect(
      presignSchema.safeParse({ contentType: 'image/jpeg', kind: 'sales' }).success,
    ).toBe(true);
  });

  it('accepts a HEIC sh upload (iPad sometimes emits these)', () => {
    expect(
      presignSchema.safeParse({ contentType: 'image/heic', kind: 'sh' }).success,
    ).toBe(true);
  });

  it('rejects a non-image content type', () => {
    expect(
      presignSchema.safeParse({ contentType: 'application/pdf', kind: 'sales' }).success,
    ).toBe(false);
  });

  it('rejects an unknown intake kind', () => {
    expect(
      presignSchema.safeParse({ contentType: 'image/jpeg', kind: 'misc' }).success,
    ).toBe(false);
  });
});

describe('ocrSchema', () => {
  it('accepts a photos/intake/sales key', () => {
    expect(
      ocrSchema.safeParse({
        key: 'photos/intake/sales/abc-123.jpg',
      }).success,
    ).toBe(true);
  });

  it('accepts a photos/intake/sh key', () => {
    expect(
      ocrSchema.safeParse({
        key: 'photos/intake/sh/abc-123.jpeg',
      }).success,
    ).toBe(true);
  });

  it('rejects keys outside the intake prefix (so OCR cannot be aimed at other objects)', () => {
    expect(
      ocrSchema.safeParse({
        key: 'invoices/123.pdf',
      }).success,
    ).toBe(false);
  });

  it('rejects path-traversal-style keys', () => {
    expect(
      ocrSchema.safeParse({
        key: 'photos/intake/sales/../../../etc/passwd',
      }).success,
    ).toBe(false);
  });
});
