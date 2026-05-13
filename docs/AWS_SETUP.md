# AWS setup for Phase 2.6 (photos + OCR)

This is the one-time AWS provisioning needed before [PR 2.6](PLAN.md#phase-2-intake--sh-domain) (S3 photo upload + Textract OCR) can run end-to-end. After you finish the steps below, set the env vars from [§4](#4-env-vars) on both local dev and the EC2 host and the photo flow lights up.

You only need to do this once. Subsequent phases (S&H invoice PDFs in PR 3, report PDFs in PR 5) reuse the same bucket + IAM user — just additional `s3:PutObject` keys under different prefixes.

## 1. Create the S3 bucket

**AWS Console → S3 → Create bucket.**

| Setting | Value |
| --- | --- |
| Bucket name | `airtight-container-prod` (or whatever; must be globally unique) |
| Region | `us-east-1` (same as everything else AWS-side; cheapest egress to EC2) |
| Block all public access | ✅ **Keep all four blocks enabled** — we use pre-signed URLs, the bucket is private |
| Bucket Versioning | Disabled (don't need it; photos aren't edited) |
| Default encryption | SSE-S3 (default, free) |

**Then configure CORS** (Properties → CORS configuration → Edit). This is what lets the iPad PUT directly to S3 from the live origin:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": [
      "https://www.airtightshippingcontainer.com",
      "https://airtightshippingcontainer.com",
      "http://localhost:3000"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

(The apex `airtightshippingcontainer.com` entry covers users who arrive without the `www.` prefix — Safari sometimes drops it.)

Bucket prefix layout (server enforces; nothing to set up in the console):

```
photos/intake/<sh-or-inventory>/<uuid>.jpg     # intake photos (PR 2.6)
invoices/<invoice_id>.pdf                       # sales invoices (PR 3)
sh-invoices/<sh_invoice_id>.pdf                 # S&H invoices (PR 3)
reports/<report_id>.pdf                         # generated reports (PR 5)
```

## 2. Create the IAM user

**IAM → Users → Create user.**

| Setting | Value |
| --- | --- |
| User name | `airtight-app` |
| Access type | "Provide user access to the AWS Management Console" → **unchecked** (programmatic only) |
| Attach policies | Skip — we attach inline |

After creation, **Add inline policy** with this JSON (replace `BUCKET-NAME` with your bucket):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3BucketObjects",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::BUCKET-NAME/*"
    },
    {
      "Sid": "TextractSync",
      "Effect": "Allow",
      "Action": ["textract:DetectDocumentText"],
      "Resource": "*"
    }
  ]
}
```

Notes on the policy:

- **S3 actions are scoped to objects** (`/*`), not the bucket itself. The app never lists, creates, or deletes the bucket — just puts/gets/deletes objects.
- **`DeleteObject` is included** so admin-side delete of an inventory row also cleans up its photos. Drop it if you'd rather photos linger as a soft-archive.
- **Textract permissions are wildcard** because Textract APIs don't support resource-level scoping. The action is limited to the sync `DetectDocumentText` call (no async jobs, no Analyze flavors).
- We are **not using STS / role assumption / instance profile**. On EC2 the user creds live in `~/airtight-container/.env`. If you'd rather use an IAM role attached to the EC2 instance (better practice — no static keys), say so and I'll swap the SDK init to drop the static creds.

## 3. Generate access keys

In the new user's page → **Security credentials → Create access key → Application running outside AWS**.

Save the `Access key ID` and `Secret access key` somewhere safe (a password manager — they're shown once and never again).

## 4. Env vars

Add to `server/.env` (local dev) and `~/airtight-container/.env` (EC2):

```
AWS_REGION=us-east-1
AWS_S3_BUCKET=airtight-container-prod
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

Also add these to `server/.env.example` (placeholder values) and to the GitHub Actions secrets if CI ever needs to talk to AWS (it currently doesn't — deploys are SSH-only).

## 5. Smoke test (after env vars are set)

```bash
cd server
npx tsx scripts/smoke-s3.ts   # presigns a PUT, uploads a 1-byte file, presigns a GET, downloads it, deletes it
npx tsx scripts/smoke-textract.ts ./tests/fixtures/container-doors.jpg   # extracts unit_number from a sample photo
```

The fixture should be a clear photo of the **container doors** — that's
the canonical OCR target. ISO 6346 puts the unit number on five places
on the container; the doors carry the largest, always-horizontal copy.
Side panels sometimes have vertical text, which Textract handles less
reliably.

Both scripts ship with PR 2.6.

## 6. Cost outlook

At your throughput (~10 boxes/day, ~2 photos/box, ~5 MB each) the full photo program runs about **$50–60/year**, dominated by S3 standard-tier storage. Textract for unit-number extraction is ~$1.50 per 1000 photos — under $6/year. Pre-signed URL generation is free (it's a local crypto signature).

## 7. What this does NOT cover

- **CloudFront / CDN.** Bucket reads come direct from S3. At your traffic, latency is fine. Revisit if photos ever appear in customer-facing email or invoices.
- **Object lifecycle policy.** Photos stay in Standard tier forever. Add a Glacier transition policy (e.g. > 1 year → Glacier Deep Archive) later if storage grows past a few hundred GB.
- **Bucket replication.** No cross-region replica. If `us-east-1` goes down the photos are unreachable; we accept that.
- **PII review.** Photos may incidentally include staff faces, license plates of trucks, paperwork with customer info. Bucket is private (Block Public Access on) so this is low risk, but flag if compliance ever asks.
