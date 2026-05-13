import { describe, it, expect } from 'vitest';
import { addContainersSchema } from '../../validation/release.js';

describe('addContainersSchema', () => {
  it('accepts a small list of trimmed container numbers', () => {
    expect(
      addContainersSchema.safeParse({ numbers: ['MSCU1234567', 'TRHU2174232'] })
        .success,
    ).toBe(true);
  });

  it('trims whitespace on each number', () => {
    const r = addContainersSchema.safeParse({
      numbers: ['  MSCU1234567  ', 'TRHU2174232\n'],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.numbers).toEqual(['MSCU1234567', 'TRHU2174232']);
  });

  it('rejects an empty list', () => {
    expect(addContainersSchema.safeParse({ numbers: [] }).success).toBe(false);
  });

  it('rejects a list of empty strings', () => {
    expect(addContainersSchema.safeParse({ numbers: ['  '] }).success).toBe(false);
  });

  it('rejects a list larger than 100', () => {
    const numbers = Array.from({ length: 101 }, (_, i) => `ABCD${String(i).padStart(7, '0')}`);
    expect(addContainersSchema.safeParse({ numbers }).success).toBe(false);
  });
});
