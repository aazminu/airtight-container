// Smoke test for the Textract wiring described in docs/AWS_SETUP.md §5.
//
// Self-contained: doesn't import server/lib/textract.ts (which lands in
// PR 2.6 proper). Reads a local image, sends it to DetectDocumentText
// via the sync API (one round-trip, max 10 MB / 1 page), prints every
// LINE block, and flags any line that matches an ISO 6346 container
// unit number (4 letters + 7 digits).
//
// Usage:
//   cd server
//   npx tsx scripts/smoke-textract.ts ./tests/fixtures/container-doors.jpg
//
// Fixture image: a clear photo of the container doors. The doors carry
// the largest, always-horizontal copy of the unit number under ISO 6346,
// so they're the canonical OCR target. Crop tight if you can — Textract
// charges per page, not per character.

import 'dotenv/config';
import { readFile } from 'fs/promises';
import {
  TextractClient,
  DetectDocumentTextCommand,
} from '@aws-sdk/client-textract';

const need = (key: string): string => {
  const v = process.env[key];
  if (!v) {
    console.error(`FAIL: env var ${key} is not set`);
    process.exit(1);
  }
  return v;
};

const region = need('AWS_REGION');
need('AWS_ACCESS_KEY_ID');
need('AWS_SECRET_ACCESS_KEY');

const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: tsx scripts/smoke-textract.ts <path-to-image>');
  process.exit(1);
}

// ISO 6346 container unit number: 4 letters (owner code + U/J/Z) + 6 digits + 1 check digit.
// Allow optional whitespace because Textract sometimes splits the trailing check digit
// into its own line — we glue and re-test below.
const UNIT_NUMBER_RE = /\b([A-Z]{4})\s?(\d{6})\s?(\d)\b/;

async function main() {
  const bytes = await readFile(imagePath);
  console.log(`Loaded ${imagePath} (${bytes.length} bytes)`);

  const textract = new TextractClient({ region });
  const out = await textract.send(
    new DetectDocumentTextCommand({ Document: { Bytes: bytes } }),
  );

  const lines = (out.Blocks ?? [])
    .filter((b) => b.BlockType === 'LINE')
    .map((b) => (b.Text ?? '').trim())
    .filter(Boolean);

  console.log(`\nDetected ${lines.length} LINE block(s):`);
  for (const line of lines) {
    console.log(`  ${line}`);
  }

  // Look across line breaks too — Textract sometimes splits "MSCU 123456 7"
  // into two lines because of the gap before the check digit.
  const joined = lines.join(' ').toUpperCase();
  const match = joined.match(UNIT_NUMBER_RE);
  if (match) {
    const unit = match[1] + match[2] + match[3];
    console.log(`\nOK   candidate unit_number: ${unit}`);
  } else {
    console.log('\nNote: no ISO 6346 unit number matched. That is fine for an arbitrary photo, but if you used a real container plate photo and got nothing, OCR may need a clearer crop.');
  }

  console.log('\nAll good. Textract is wired correctly.');
}

main().catch((e) => {
  console.error('FAIL: Textract call threw');
  console.error(e);
  process.exit(1);
});
