// One-off: run Textract against every doors-N.jpg in tests/fixtures,
// snapshot the raw LINE blocks to disk so the regression test can
// run offline, and diff against doors.gt.
import 'dotenv/config';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import {
  TextractClient,
  DetectDocumentTextCommand,
} from '@aws-sdk/client-textract';
import { extractFromBlocks } from '../lib/textract.js';

const FIX_DIR = new URL('../tests/fixtures/', import.meta.url).pathname;
const OUT_DIR = new URL('./textract-fixtures/', import.meta.url).pathname;

const region = process.env.AWS_REGION;
if (!region) throw new Error('AWS_REGION not set');

const client = new TextractClient({ region });

async function loadGroundTruth(): Promise<Record<string, string>> {
  const raw = await readFile(join(FIX_DIR, 'doors.gt'), 'utf-8');
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\S+):\s*(\S+)/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const gt = await loadGroundTruth();
  const files = (await readdir(FIX_DIR))
    .filter((f) => /^doors-\d+\.jpg$/i.test(f))
    .sort();

  let pass = 0;
  let fail = 0;
  const failures: { file: string; expected: string; got: string | null; lines: string[] }[] = [];

  for (const f of files) {
    const bytes = await readFile(join(FIX_DIR, f));
    const out = await client.send(
      new DetectDocumentTextCommand({ Document: { Bytes: bytes } }),
    );
    const lines = (out.Blocks ?? [])
      .filter((b) => b.BlockType === 'LINE')
      .map((b) => (b.Text ?? '').trim())
      .filter(Boolean);

    // Persist as a deterministic fixture: array of LINE strings.
    const fixturePath = join(OUT_DIR, f.replace(/\.jpg$/i, '.lines.json'));
    await writeFile(fixturePath, JSON.stringify(lines, null, 2) + '\n');

    const extract = extractFromBlocks(
      (out.Blocks ?? []).filter((b) => b.BlockType === 'LINE'),
    );
    const expected = gt[f];
    const ok = extract.unit_number === expected;

    console.log(
      `\n=== ${f} ===  expected=${expected}  got=${extract.unit_number}  ${ok ? 'OK' : 'FAIL'}`,
    );
    console.log(`LINES: ${JSON.stringify(lines)}`);

    if (ok) pass++;
    else {
      fail++;
      failures.push({ file: f, expected, got: extract.unit_number, lines });
    }
  }

  console.log(`\n----\n${pass} passed, ${fail} failed\n`);
  if (failures.length) {
    console.log('FAILURES:');
    for (const f of failures) console.log(JSON.stringify(f, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
