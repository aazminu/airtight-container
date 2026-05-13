// Smoke test for the S3 wiring described in docs/AWS_SETUP.md §5.
//
// Self-contained on purpose: it doesn't import server/lib/s3.ts (which lands
// in PR 2.6 proper). The goal is to prove your AWS_* env vars + bucket
// CORS / IAM policy are correct before the app code ever touches S3.
//
// Usage:
//   cd server
//   npx tsx scripts/smoke-s3.ts
//
// Each step prints a one-line OK / FAIL. Any failure stops the script.

import 'dotenv/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const need = (key: string): string => {
  const v = process.env[key];
  if (!v) {
    console.error(`FAIL: env var ${key} is not set`);
    process.exit(1);
  }
  return v;
};

const region = need('AWS_REGION');
const bucket = need('AWS_S3_BUCKET');
need('AWS_ACCESS_KEY_ID');
need('AWS_SECRET_ACCESS_KEY');

const s3 = new S3Client({ region });
const key = `smoke/${randomUUID()}.txt`;
const body = `smoke ${new Date().toISOString()}`;

async function main() {
  // 1. Presign a PUT URL and upload via fetch — same path the iPad will take.
  let putUrl: string;
  try {
    putUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'text/plain' }),
      { expiresIn: 60 },
    );
    console.log(`OK   presigned PUT (${putUrl.length} chars)`);
  } catch (e) {
    console.error('FAIL: presign PUT — check IAM s3:PutObject');
    throw e;
  }

  try {
    const res = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    if (!res.ok) {
      console.error(`FAIL: PUT to S3 returned ${res.status} ${res.statusText}`);
      console.error('Most likely cause: bucket CORS does not include this origin, or the IAM policy is wrong.');
      console.error(await res.text().catch(() => ''));
      process.exit(1);
    }
    console.log(`OK   PUT ${key} (${body.length} bytes)`);
  } catch (e) {
    console.error('FAIL: PUT fetch threw');
    throw e;
  }

  // 2. Presign a GET URL and read back.
  let getUrl: string;
  try {
    getUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 60 },
    );
    console.log(`OK   presigned GET (${getUrl.length} chars)`);
  } catch (e) {
    console.error('FAIL: presign GET — check IAM s3:GetObject');
    throw e;
  }

  try {
    const res = await fetch(getUrl);
    if (!res.ok) {
      console.error(`FAIL: GET returned ${res.status}`);
      process.exit(1);
    }
    const text = await res.text();
    if (text !== body) {
      console.error(`FAIL: GET payload mismatch — expected "${body}", got "${text}"`);
      process.exit(1);
    }
    console.log(`OK   GET payload matches`);
  } catch (e) {
    console.error('FAIL: GET fetch threw');
    throw e;
  }

  // 3. Clean up.
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.log(`OK   deleted ${key}`);
  } catch (e) {
    console.error('FAIL: DELETE — check IAM s3:DeleteObject (or drop it from the policy if you do not want app-side delete)');
    throw e;
  }

  console.log('\nAll good. S3 is wired correctly.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
