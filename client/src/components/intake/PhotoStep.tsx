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

export type PhotoStepMode = 'doors' | 'other';

interface Props {
  kind: IntakeKind;
  mode: PhotoStepMode;
  photos: IntakePhoto[];
  onChange: (photos: IntakePhoto[]) => void;
  /** Called with the OCR result for the doors photo only. Ignored when
   *  `mode === 'other'` since we don't OCR those. */
  onOcr?: (result: { unit_number: string | null; size: string | null; lines: string[] }) => void;
}

// Two-mode photo capture step (PR 2.8.1):
//   - 'doors':  Up to one photo. Optional / skippable. OCR runs on it.
//   - 'other':  Any number of photos. No OCR. Optional documentation.
//
// The doors photo is the canonical OCR target. The Confirm step still
// handles the "no image provided" fall-back (manual unit-number input).
export function PhotoStep({ kind, mode, photos, onChange, onOcr }: Props) {
  const [topLevelError, setTopLevelError] = useState<string | null>(null);

  const isDoors = mode === 'doors';
  const reachedMax = isDoors && photos.length >= 1;

  const addPhoto = async (file: File) => {
    setTopLevelError(null);
    const previewUrl = URL.createObjectURL(file);
    const placeholder: IntakePhoto = { key: '', previewUrl, uploading: true };
    const optimistic = [...photos, placeholder];
    onChange(optimistic);

    try {
      const { url, key } = await presignIntakePhoto(kind, file.type);
      await uploadToS3(url, file, file.type);
      const completed: IntakePhoto = { key, previewUrl, uploading: false };
      onChange([...photos, completed]);

      if (isDoors && onOcr) {
        try {
          const ocr = await ocrIntakePhoto(key);
          onOcr(ocr);
        } catch (e) {
          // Non-fatal: staff types the unit number by hand on the next step.
          setTopLevelError(
            "We couldn't read the unit number from this photo. Type it by hand on the next step.",
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
    e.target.value = '';
    void addPhoto(file);
  };

  const removeAt = (idx: number) => {
    const photo = photos[idx];
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    onChange(photos.filter((_, i) => i !== idx));
  };

  const title = isDoors ? 'Photo of the doors' : 'Other photos';
  const intro = isDoors ? (
    <>
      Take a clear photo of <strong>the doors</strong>. Make sure the painted
      unit numbers and the white sticker are right-side up and easy to read.
      You can skip this if the camera isn't handy.
    </>
  ) : (
    <>
      Optional. Snap any damage, the inside, or other angles you want on file.
      You can add as many as you want, or just tap Next to keep going.
    </>
  );
  const captureLabel = (() => {
    if (isDoors) {
      return photos.length === 0 ? 'Take the door photo' : 'Retake door photo';
    }
    return photos.length === 0 ? 'Take a photo' : '+ Add another photo';
  })();

  return (
    <div className={styles.wrap}>
      <h2 className={styles.h2}>{title}</h2>
      <p className={styles.intro}>{intro}</p>

      <div className={styles.captureRow}>
        <label className={styles.captureBtn}>
          {captureLabel}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleInput}
            disabled={reachedMax}
          />
        </label>
      </div>

      {photos.length > 0 && (
        <div className={styles.grid}>
          {photos.map((p, i) => (
            <div
              key={`${p.key || 'pending'}-${i}`}
              className={styles.tile}
              data-role={isDoors ? 'primary' : 'extra'}
            >
              {p.uploading ? (
                <div className={styles.uploading}>Uploading…</div>
              ) : p.error ? (
                <div className={styles.uploading}>Failed</div>
              ) : (
                <img src={p.previewUrl} alt={`Photo ${i + 1}`} />
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
