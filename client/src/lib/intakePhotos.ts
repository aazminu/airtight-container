// Thin wrapper over the PR 2.6 intake endpoints. Centralised here so
// PhotoStep + ConfirmStep can call the same code and so tests can mock
// `fetch` in one place if we ever add UI-level tests for these.

export type IntakeKind = 'sales' | 'sh';

interface PresignResponse {
  data: { url: string; key: string };
}

interface OcrResponse {
  data: { unit_number: string | null; lines: string[] };
}

export async function presignIntakePhoto(
  kind: IntakeKind,
  contentType: string,
): Promise<{ url: string; key: string }> {
  const res = await fetch('/api/v2/intake/photo/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ kind, contentType }),
  });
  if (!res.ok) throw new Error(`presign failed: HTTP ${res.status}`);
  const body = (await res.json()) as PresignResponse;
  return body.data;
}

// Upload directly to S3 via the presigned URL. Doesn't carry the cookie
// (it's a different origin) — credentials are baked into the signed URL.
export async function uploadToS3(
  url: string,
  file: Blob,
  contentType: string,
): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`S3 upload failed: HTTP ${res.status} ${text}`);
  }
}

export async function ocrIntakePhoto(
  key: string,
): Promise<{ unit_number: string | null; lines: string[] }> {
  const res = await fetch('/api/v2/intake/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ key }),
  });
  if (!res.ok) throw new Error(`ocr failed: HTTP ${res.status}`);
  const body = (await res.json()) as OcrResponse;
  return body.data;
}
