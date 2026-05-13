import { useState } from 'react';
import {
  ocrIntakePhoto,
  presignIntakePhoto,
  uploadToS3,
  type IntakeKind,
} from '../../lib/intakePhotos';
import styles from './PhotoStep.module.css';

export interface IntakePhoto {
  key: string;       // S3 key once upload completes
  previewUrl: string; // object URL for the local Blob (revoked when removed)
  uploading: boolean;
  error?: string;
}

interface Props {
  kind: IntakeKind;
  photos: IntakePhoto[];
  onChange: (photos: IntakePhoto[]) => void;
  /** Called with the OCR result for the first (OCR-target) photo only. */
  onOcr?: (result: { unit_number: string | null; lines: string[] }) => void;
}

// Photo capture step. Staff taps the big capture button, the iPad camera
// opens via the standard <input capture="environment">, the resulting
// blob is uploaded to S3 via a presigned PUT, and Textract is invoked
// against the first photo (the OCR target). Additional photos go up
// without OCR. PR 2.6.
export function PhotoStep({ kind, photos, onChange, onOcr }: Props) {
  const [topLevelError, setTopLevelError] = useState<string | null>(null);

  const addPhoto = async (file: File) => {
    setTopLevelError(null);
    const previewUrl = URL.createObjectURL(file);
    const isFirst = photos.length === 0;
    const placeholder: IntakePhoto = {
      key: '',
      previewUrl,
      uploading: true,
    };
    const optimistic = [...photos, placeholder];
    onChange(optimistic);

    try {
      const { url, key } = await presignIntakePhoto(kind, file.type);
      await uploadToS3(url, file, file.type);
      const completed: IntakePhoto = { key, previewUrl, uploading: false };
      // Replace the trailing placeholder we just added. Doing it by index
      // (vs identity) so a fast "remove" before we land doesn't desync.
      onChange([...photos, completed]);

      if (isFirst && onOcr) {
        try {
          const ocr = await ocrIntakePhoto(key);
          onOcr(ocr);
        } catch (e) {
          // OCR failure is non-fatal — staff can type the unit_number by
          // hand on the Confirm step. Surface a soft warning, don't roll
          // back the upload.
          setTopLevelError(
            'OCR failed — type the unit number by hand on the next step.',
          );
          console.error(e);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed';
      onChange([
        ...photos,
        { key: '', previewUrl, uploading: false, error: message },
      ]);
      setTopLevelError(message);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-selecting the same file
    void addPhoto(file);
  };

  const removeAt = (idx: number) => {
    const photo = photos[idx];
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    onChange(photos.filter((_, i) => i !== idx));
  };

  const hasPrimary = photos.some((p) => !p.error && !p.uploading);
  const captureLabel =
    photos.length === 0
      ? 'Take a photo of the doors'
      : '+ Add another photo (optional)';

  return (
    <div className={styles.wrap}>
      <h2>Photos</h2>
      <p className={styles.intro}>
        Photograph the <strong>container doors</strong> — both painted unit
        numbers should be visible and right-side up. Optional extras for damage
        or paperwork can be added after the first photo.
      </p>

      <div className={styles.captureRow}>
        <label className={styles.captureBtn}>
          {captureLabel}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleInput}
          />
        </label>
      </div>

      {photos.length > 0 && (
        <div className={styles.grid}>
          {photos.map((p, i) => (
            <div
              key={`${p.key || 'pending'}-${i}`}
              className={styles.tile}
              data-role={i === 0 ? 'primary' : 'extra'}
            >
              {i === 0 && hasPrimary && <span className={styles.tileRole}>OCR target</span>}
              {p.uploading ? (
                <div className={styles.uploading}>Uploading…</div>
              ) : p.error ? (
                <div className={styles.uploading}>Failed</div>
              ) : (
                <img src={p.previewUrl} alt={`Intake photo ${i + 1}`} />
              )}
              <button
                type="button"
                className={styles.tileRemove}
                onClick={() => removeAt(i)}
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {topLevelError && <div className={styles.error}>{topLevelError}</div>}
    </div>
  );
}
