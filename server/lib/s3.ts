import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

// Thin S3 wrapper used by the intake photo upload + audit display flows.
// The smoke script at server/scripts/smoke-s3.ts validates the env + IAM
// without going through this file; both follow the same put/get/delete
// surface so the script's success implies this module will work too.
//
// Config is read lazily on first use so test imports don't need fake env.

let _client: S3Client | null = null;
let _bucket: string | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  const region = process.env.AWS_REGION;
  if (!region) throw new Error('AWS_REGION is not set');
  _client = new S3Client({ region });
  return _client;
}

export function getBucket(): string {
  if (_bucket) return _bucket;
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('AWS_S3_BUCKET is not set');
  _bucket = bucket;
  return _bucket;
}

// Key layout per docs/AWS_SETUP.md §1. Keep the prefixes in sync with
// the doc — they're load-bearing for future Glacier lifecycle rules.
export type IntakeKind = 'sales' | 'sh';

export function intakePhotoKey(kind: IntakeKind, extension = 'jpg'): string {
  return `photos/intake/${kind}/${randomUUID()}.${extension}`;
}

const DEFAULT_PUT_TTL_SECONDS = 300;  // iPad takes a photo, uploads quickly
const DEFAULT_GET_TTL_SECONDS = 3600; // audit screen views the photo

export async function presignedPut(
  key: string,
  contentType: string,
  ttlSeconds = DEFAULT_PUT_TTL_SECONDS,
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({ Bucket: getBucket(), Key: key, ContentType: contentType }),
    { expiresIn: ttlSeconds },
  );
}

export async function presignedGet(
  key: string,
  ttlSeconds = DEFAULT_GET_TTL_SECONDS,
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn: ttlSeconds },
  );
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key }),
  );
}

// PR 3.2: direct PUT for server-rendered PDFs. Photos go through
// presigned-PUT (iPad uploads directly), but PDFs are generated inside
// the backend container so a direct PutObject is the right shape.
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

// PR 3.4: server-side fetch used by the email pipeline to attach the
// stored PDF directly (vs. signed URL) so the customer sees an
// attachment instead of a link.
export async function getObjectBytes(key: string): Promise<Buffer> {
  const resp = await getClient().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  );
  if (!resp.Body) throw new Error(`S3 object ${key} has no body`);
  const chunks: Buffer[] = [];
  for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
