import { describe, it, expect } from 'vitest';
import {
  extractFromBlocks,
  iso6346CheckDigit,
  isValidIso6346,
} from '../../lib/textract.js';
import type { Block } from '@aws-sdk/client-textract';

const line = (text: string): Block => ({
  BlockType: 'LINE',
  Text: text,
});

describe('iso6346CheckDigit', () => {
  it('computes 2 for TRHU217423 (real container, validated against user smoke test)', () => {
    expect(iso6346CheckDigit('TRHU217423')).toBe(2);
  });

  it('computes 6 for MSCU123456', () => {
    // Hand-verified: 24+60+52+256+16+64+192+512+1280+3072 = 5528, mod 11 = 6.
    expect(iso6346CheckDigit('MSCU123456')).toBe(6);
  });

  it('returns null when the format is wrong', () => {
    expect(iso6346CheckDigit('TRHU21742')).toBeNull();   // 9 chars
    expect(iso6346CheckDigit('TRH217423X')).toBeNull();  // bad chars
    expect(iso6346CheckDigit('trhu217423')).toBeNull();  // lowercase rejected
  });
});

describe('isValidIso6346', () => {
  it('accepts TRHU2174232 (from a real photo)', () => {
    expect(isValidIso6346('TRHU2174232')).toBe(true);
  });

  it('rejects TRHU2174239 (wrong check digit)', () => {
    expect(isValidIso6346('TRHU2174239')).toBe(false);
  });

  it('rejects shapes that are not 4 letters + 7 digits', () => {
    expect(isValidIso6346('TRHU217423')).toBe(false);
    expect(isValidIso6346('1234TRHU567')).toBe(false);
    expect(isValidIso6346('')).toBe(false);
  });
});

describe('extractFromBlocks', () => {
  it('returns null when nothing matches', () => {
    const r = extractFromBlocks([line('hello world'), line('not a container')]);
    expect(r.unit_number).toBeNull();
  });

  it('extracts from the real user photo (TRITON / TRHU / 217423 / 2 / 22G1 / etc.)', () => {
    // Captured verbatim from the user's smoke-textract.ts run.
    const r = extractFromBlocks([
      line('TRITON'),
      line('TRHU'),
      line('217423'),
      line('2'),
      line('22G1'),
      line('MAXGROSS'),
      line('30.480 KGS'),
      line('67.200 LBS'),
      line('TARE WT.'),
      line('2.180 KGS'),
      line('4.810 LBS'),
      line('PAYLOAD'),
      line('28.300 KGS'),
      line('62.390 LBS'),
      line('CU. CAP.'),
      line('33.2 CUM.'),
      line('1.173 CU.FT.'),
      line('B'),
      line('8'),
      line('8'),
    ]);
    expect(r.unit_number).toBe('TRHU2174232');
  });

  it('handles the 11-char concatenated form on a single token', () => {
    const r = extractFromBlocks([line('TRHU2174232'), line('22G1')]);
    expect(r.unit_number).toBe('TRHU2174232');
  });

  it('prefers an ISO 6346-valid candidate over a noise candidate when both match the shape', () => {
    // TARE is a real 4-letter word that appears on container plates; it
    // could be mis-paired with the serial and a check digit. The ISO 6346
    // check-digit filter rules it out in favour of the genuine TRHU.
    const r = extractFromBlocks([
      line('TARE'),
      line('TRHU'),
      line('217423'),
      line('2'),
    ]);
    expect(r.unit_number).toBe('TRHU2174232');
  });

  it('falls back to a best-guess candidate when nothing validates', () => {
    // MSCU + 123456 + 7 has check digit 6, so 7 is wrong. With no valid
    // candidate available, we still return the only candidate so the
    // Confirm step has something to display.
    const r = extractFromBlocks([line('MSCU 123456 7')]);
    expect(r.unit_number).toBe('MSCU1234567');
  });

  it('uppercases tokens before matching (Textract sometimes returns mixed case)', () => {
    const r = extractFromBlocks([line('trhu'), line('217423'), line('2')]);
    expect(r.unit_number).toBe('TRHU2174232');
  });

  it('skips non-LINE blocks', () => {
    const blocks: Block[] = [
      { BlockType: 'PAGE', Text: 'page' },
      { BlockType: 'WORD', Text: 'TRHU' },
      line('TRHU'),
      line('217423'),
      line('2'),
    ];
    expect(extractFromBlocks(blocks).unit_number).toBe('TRHU2174232');
  });
});
