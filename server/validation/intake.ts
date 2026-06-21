import { z } from 'zod';

// Validation for the intake photo upload + OCR routes (PR 2.6).
//
// presign — staff posts the content-type they're about to PUT and which
//   intake branch (sales vs sh) the photo belongs to. The server picks
//   the S3 key so users can't write to arbitrary prefixes.
//
// ocr — staff posts the key they just PUT to; the server runs Textract
//   against that S3 object. We constrain the key to the photos/intake/*
//   prefix so a malicious caller can't aim Textract at unrelated
//   objects (e.g. once invoices land in PR 3).

export const presignSchema = z.object({
  // Match standard browser-issued types; jpegs are typical from iPad
  // capture but the OCR pipeline works on png/heic too. Reject anything
  // non-image so we don't sign URLs for arbitrary content.
  //
  // SVG is explicitly blocked: it's the one image/* subtype that can carry
  // an embedded <script>, making it stored XSS if ever opened top-level from
  // S3. We keep the permissive image/* match (rather than a hard enum) so the
  // varied content-types real phones/tablets emit don't break the yard upload
  // flow — SVG is the only XSS-capable image subtype, so a precise block is
  // as safe here as an allowlist.
  contentType: z
    .string()
    .regex(/^image\/[a-zA-Z0-9.+-]+$/, 'Must be an image/* content type')
    .refine((ct) => !/^image\/svg(\+xml)?$/i.test(ct.trim()), {
      message: 'SVG uploads are not allowed',
    }),
  kind: z.enum(['sales', 'sh']),
});

export type PresignInput = z.infer<typeof presignSchema>;

export const ocrSchema = z.object({
  key: z
    .string()
    .regex(/^photos\/intake\/(sales|sh)\/[A-Za-z0-9-]+\.[A-Za-z0-9]+$/, {
      message: 'Key must be a photos/intake/* upload',
    }),
});

export type OcrInput = z.infer<typeof ocrSchema>;
