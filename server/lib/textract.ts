import {
  DetectDocumentTextCommand,
  TextractClient,
  type Block,
} from '@aws-sdk/client-textract';
import { getBucket } from './s3.js';

let _client: TextractClient | null = null;

function getClient(): TextractClient {
  if (_client) return _client;
  const region = process.env.AWS_REGION;
  if (!region) throw new Error('AWS_REGION is not set');
  _client = new TextractClient({ region });
  return _client;
}

export interface ExtractResult {
  unit_number: string | null;
  lines: string[];
}

// ---- ISO 6346 -----------------------------------------------------------

// Letter values for the ISO 6346 check-digit algorithm. The table skips
// multiples of 11 (so e.g. A=10 then B=12 — there is no value 11).
const LETTER_VALUES: Record<string, number> = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};

// Computes the ISO 6346 check digit for a 10-char owner+serial. Returns
// null if the input shape is wrong. Returns the mod-11 result (0-10).
// The spec considers mod-result 10 invalid for new assignments, but
// older containers may display 0 in that slot — see isValidIso6346.
export function iso6346CheckDigit(code: string): number | null {
  if (!/^[A-Z]{4}\d{6}$/.test(code)) return null;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = code[i];
    const v = c >= '0' && c <= '9' ? Number(c) : LETTER_VALUES[c];
    if (v === undefined) return null;
    sum += v * (1 << i); // weight is 2^i
  }
  return sum % 11;
}

// Returns true iff `unitNumber` is 11 chars (4 letters + 7 digits) and
// its trailing digit matches the ISO 6346 check digit of the first 10.
export function isValidIso6346(unitNumber: string): boolean {
  if (!/^[A-Z]{4}\d{7}$/.test(unitNumber)) return false;
  const expected = iso6346CheckDigit(unitNumber.slice(0, 10));
  if (expected === null) return false;
  const actual = Number(unitNumber[10]);
  // Accept mod-10 codes that print as 0 — non-spec but seen in the wild.
  return expected === actual || (expected === 10 && actual === 0);
}

// ---- extraction ---------------------------------------------------------

// Pulls a container unit number out of Textract's LINE blocks. Designed
// for real container photos where Textract often emits the four-letter
// owner code, six-digit serial, and boxed check digit as separate LINE
// blocks — with unrelated text (manufacturer, TARE, MAXGROSS, etc.)
// scattered between them.
//
// Strategy:
//   1. Tokenize every LINE on whitespace.
//   2. Bucket tokens into pools: 4-letter owner codes, 6-digit serials,
//      single-digit check candidates. Also catch the rare case where the
//      whole 11-char number is one token.
//   3. Take the cross-product as candidate unit numbers.
//   4. Prefer any candidate that passes the ISO 6346 check-digit test;
//      fall back to the first candidate otherwise. The Confirm step in
//      the UI is the user-facing safety net for either path.
export function extractFromBlocks(blocks: Block[]): ExtractResult {
  const lines = blocks
    .filter((b) => b.BlockType === 'LINE')
    .map((b) => (b.Text ?? '').trim())
    .filter(Boolean);

  const tokens = lines
    .flatMap((l) => l.toUpperCase().split(/\s+/))
    .filter(Boolean);

  const candidates: string[] = [];

  // Concatenated single-token form: "TRHU2174232".
  for (const t of tokens) {
    const m = t.match(/^([A-Z]{4})(\d{6})(\d)$/);
    if (m) candidates.push(m[1] + m[2] + m[3]);
  }

  // Cross-product of owner / serial / check token pools.
  const owners = tokens.filter((t) => /^[A-Z]{4}$/.test(t));
  const serials = tokens.filter((t) => /^\d{6}$/.test(t));
  const checks = tokens.filter((t) => /^\d$/.test(t));
  for (const o of owners) {
    for (const s of serials) {
      for (const c of checks) {
        candidates.push(o + s + c);
      }
    }
  }

  // Dedupe preserving first-seen order so the fall-back picks the most
  // "natural" candidate (single-token / first-tokens-seen).
  const unique = Array.from(new Set(candidates));

  const validated = unique.find(isValidIso6346);
  const unit_number = validated ?? unique[0] ?? null;
  return { unit_number, lines };
}

// Runs DetectDocumentText against an object already in our intake bucket.
// We use the S3Object input (vs Bytes) because the photo is uploaded
// directly from the iPad via a presigned PUT; passing the bytes again
// from the server would double the egress for no benefit.
export async function extractFromS3Key(key: string): Promise<ExtractResult> {
  const out = await getClient().send(
    new DetectDocumentTextCommand({
      Document: { S3Object: { Bucket: getBucket(), Name: key } },
    }),
  );
  return extractFromBlocks(out.Blocks ?? []);
}
