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

// ISO 6346 container unit number: 4 uppercase letters (owner code + U/J/Z
// equipment category) + 6 digits + 1 check digit. Match with optional
// whitespace because Textract sometimes splits the trailing check digit
// onto its own block, and across line boundaries because some
// containers paint the check digit on a separate row.
const UNIT_NUMBER_RE = /\b([A-Z]{4})\s?(\d{6})\s?(\d)\b/;

export interface ExtractResult {
  unit_number: string | null;
  lines: string[];
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

// Pure block-parsing helper, exported so tests can hit it without
// mocking the AWS client.
export function extractFromBlocks(blocks: Block[]): ExtractResult {
  const lines = blocks
    .filter((b) => b.BlockType === 'LINE')
    .map((b) => (b.Text ?? '').trim())
    .filter(Boolean);

  const joined = lines.join(' ').toUpperCase();
  const match = joined.match(UNIT_NUMBER_RE);
  const unit_number = match ? match[1] + match[2] + match[3] : null;
  return { unit_number, lines };
}
