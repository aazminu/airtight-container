import { Trans, useTranslation } from 'react-i18next';
import styles from './IntakeForm.module.css';

export interface OcrResult {
  unit_number: string | null;
  size: string | null;
  lines: string[];
}

interface Props {
  /** Result emitted by the doors photo's OCR, or null when staff skipped
   *  the photo or OCR didn't run. */
  ocr: OcrResult | null;
  /** Current unit-number value. Editable here; read-only on Details. */
  unitNumber: string;
  onChange: (unitNumber: string) => void;
  /** Optional release-match badge shown when the typed unit number
   *  matches a pre-loaded release container. */
  releaseMatch?: { release_number_value: string; sale_company_name: string } | null;
}

// Confirm step (PR 2.8.1). Re-styled friendlier copy + handles the
// "no photo / OCR didn't find anything" path explicitly. This is the
// ONLY step where the unit number is editable; Details shows it as a
// read-only line at the top.
export function ConfirmStep({ ocr, unitNumber, onChange, releaseMatch }: Props) {
  const { t } = useTranslation();
  const matchedSomething = ocr?.unit_number !== null && ocr?.unit_number !== undefined;
  const skipped = ocr === null;

  return (
    <div className={styles.form}>
      <h2 className={styles.h2}>{t('confirm_step.heading')}</h2>

      {skipped ? (
        <p className={styles.reviewIntro}>
          {t('confirm_step.no_image')}
        </p>
      ) : matchedSomething ? (
        <p className={styles.reviewIntro}>
          <Trans
            i18nKey={
              ocr?.size
                ? 'confirm_step.read_success'
                : 'confirm_step.read_success_no_size'
            }
            values={{
              unit: ocr!.unit_number ?? '',
              size: ocr?.size ?? '',
            }}
            components={{ strong: <strong /> }}
          />
        </p>
      ) : (
        <p className={styles.reviewIntro}>
          {t('confirm_step.read_failed')}
        </p>
      )}

      <label className={styles.field}>
        <span className={styles.label}>{t('confirm_step.unit_label')}</span>
        <input
          type="text"
          value={unitNumber}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder={t('confirm_step.unit_placeholder')}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </label>

      {releaseMatch && (
        <div className={styles.matchBadge}>
          <Trans
            i18nKey={
              releaseMatch.sale_company_name
                ? 'confirm_step.matched_release'
                : 'confirm_step.matched_release_no_company'
            }
            values={{
              release: releaseMatch.release_number_value,
              company: releaseMatch.sale_company_name ?? '',
            }}
            components={{ strong: <strong /> }}
          />
        </div>
      )}

      {ocr && ocr.lines.length > 0 && (
        <details>
          <summary>{t('confirm_step.camera_summary')}</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8125rem' }}>
            {ocr.lines.join('\n')}
          </pre>
        </details>
      )}
    </div>
  );
}
