import styles from './IntakeForm.module.css';

export interface OcrResult {
  unit_number: string | null;
  lines: string[];
}

interface Props {
  /** The OCR result emitted by PhotoStep for the first photo, or null if
   * Photos was skipped / OCR failed. */
  ocr: OcrResult | null;
  /** Current value of the unit_number field — initially the OCR'd value
   * but staff can edit it here before continuing to Details. */
  unitNumber: string;
  onChange: (unitNumber: string) => void;
}

// Confirm step (PR 2.6). Shows whatever Textract pulled and lets staff
// fix it before Details. The unit_number flows down into the Sales/SH
// details step as the prefilled value, so any correction made here is
// reflected there automatically.
export function ConfirmStep({ ocr, unitNumber, onChange }: Props) {
  const matchedSomething = ocr?.unit_number !== null && ocr?.unit_number !== undefined;
  const skipped = ocr === null;

  return (
    <div className={styles.form}>
      <h2 className={styles.h2}>Confirm unit number</h2>

      {skipped ? (
        <p className={styles.reviewIntro}>
          Photos were skipped. Type the unit number by hand below — the rest of
          the box details come on the next step.
        </p>
      ) : matchedSomething ? (
        <p className={styles.reviewIntro}>
          OCR read <strong>{ocr!.unit_number}</strong>. Confirm or fix it below.
        </p>
      ) : (
        <p className={styles.reviewIntro}>
          OCR didn't find an ISO 6346 unit number on the photo. Type it by hand.
        </p>
      )}

      <label className={styles.field}>
        <span className={styles.label}>Unit number</span>
        <input
          type="text"
          value={unitNumber}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="e.g. DRYU1234567"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </label>

      {ocr && ocr.lines.length > 0 && (
        <details>
          <summary>All detected text ({ocr.lines.length} line{ocr.lines.length === 1 ? '' : 's'})</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8125rem' }}>
            {ocr.lines.join('\n')}
          </pre>
        </details>
      )}
    </div>
  );
}
