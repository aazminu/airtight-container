import { describe, it, expect } from 'vitest';
import { extractFromBlocks } from '../../lib/textract.js';
import type { Block } from '@aws-sdk/client-textract';

const line = (text: string): Block => ({
  BlockType: 'LINE',
  Text: text,
});

describe('extractFromBlocks', () => {
  it('returns null unit_number when nothing matches', () => {
    const r = extractFromBlocks([line('hello world'), line('not a container')]);
    expect(r.unit_number).toBeNull();
    expect(r.lines).toEqual(['hello world', 'not a container']);
  });

  it('extracts a unit number when it is contained in one line', () => {
    const r = extractFromBlocks([line('MSCU 123456 7'), line('22G1')]);
    expect(r.unit_number).toBe('MSCU1234567');
  });

  it('extracts when the check digit is on its own line', () => {
    // Many containers paint the trailing check digit slightly offset; Textract
    // emits it as a separate LINE block. The matcher joins lines with spaces
    // and re-runs the regex against the combined text.
    const r = extractFromBlocks([line('MSCU 123456'), line('7'), line('22G1')]);
    expect(r.unit_number).toBe('MSCU1234567');
  });

  it('extracts even when the owner code is lowercased (incoming photo metadata varies)', () => {
    const r = extractFromBlocks([line('mscu 123456 7')]);
    expect(r.unit_number).toBe('MSCU1234567');
  });

  it('ignores 11-char strings that fail the ISO 6346 4+6+1 split', () => {
    const r = extractFromBlocks([line('1234567890A')]);
    expect(r.unit_number).toBeNull();
  });

  it('skips non-LINE blocks', () => {
    const blocks: Block[] = [
      { BlockType: 'PAGE', Text: 'page' },
      { BlockType: 'WORD', Text: 'MSCU' },
      line('MSCU 999999 8'),
    ];
    const r = extractFromBlocks(blocks);
    expect(r.unit_number).toBe('MSCU9999998');
    expect(r.lines).toEqual(['MSCU 999999 8']);
  });
});
