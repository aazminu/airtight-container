import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Block } from '@aws-sdk/client-textract';
import { extractFromBlocks } from '../../lib/textract.js';

// Regression set: real Textract LINE captures from yard photos. The
// `.lines.json` snapshots live next to the capture script that produced
// them; the ground-truth file lives next to the source images so the
// admin can edit it without diving into scripts/.
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_DIR = join(__dirname, '../../scripts/textract-fixtures');
const GT_PATH = join(__dirname, '../fixtures/doors.gt');

const loadGroundTruth = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of readFileSync(GT_PATH, 'utf-8').split('\n')) {
    const m = line.match(/^(\S+):\s*(\S+)/);
    if (m) out[m[1]] = m[2];
  }
  return out;
};

// Container unit numbers print with a visual hyphen between serial and
// check digit (TRHU217423-2). The canonical 11-char form drops it. Compare
// hyphen-insensitive so the ground-truth file can keep its display format.
const canon = (s: string | null) => s?.replace(/-/g, '') ?? null;

describe('extractFromBlocks regression — real Textract captures', () => {
  const gt = loadGroundTruth();
  const files = readdirSync(FIX_DIR).filter((f) => /\.lines\.json$/.test(f));

  for (const f of files.sort()) {
    const imageName = f.replace(/\.lines\.json$/, '.jpg');
    const expected = gt[imageName];
    if (!expected) continue;

    it(`${imageName} → ${expected}`, () => {
      const lines: string[] = JSON.parse(readFileSync(join(FIX_DIR, f), 'utf-8'));
      const blocks: Block[] = lines.map((Text) => ({ BlockType: 'LINE', Text }));
      const result = extractFromBlocks(blocks);
      expect(canon(result.unit_number)).toBe(canon(expected));
    });
  }
});
