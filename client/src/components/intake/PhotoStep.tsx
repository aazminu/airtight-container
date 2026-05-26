import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          setTopLevelError(t('photo_step.ocr_failed'));
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

  const title = isDoors ? t('photo_step.doors_heading') : t('photo_step.others_heading');
  const introKey = isDoors ? 'photo_step.doors_intro' : 'photo_step.others_intro';
  const captureLabel = (() => {
    if (isDoors) {
      return photos.length === 0
        ? t('photo_step.take_doors')
        : t('photo_step.retake_doors');
    }
    return photos.length === 0
      ? t('photo_step.take_photo')
      : t('photo_step.add_another');
  })();

  return (
    <div className={styles.wrap}>
      <h2 className={styles.h2}>{title}</h2>
      <p className={styles.intro}>
        <Trans i18nKey={introKey} components={{ strong: <strong /> }} />
      </p>

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
                <div className={styles.uploading}>{t('photo_step.uploading')}</div>
              ) : p.error ? (
                <div className={styles.uploading}>{t('photo_step.upload_failed')}</div>
              ) : (
                <img src={p.previewUrl} alt={t('photo_step.photo_alt', { n: i + 1 })} />
              )}
              <button
                type="button"
                className={styles.tileRemove}
                onClick={() => removeAt(i)}
                aria-label={t('photo_step.remove')}
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
