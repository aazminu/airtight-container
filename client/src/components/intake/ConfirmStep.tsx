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
  const matchedSomething = ocr?.unit_number !== null && ocr?.unit_number !== undefined;
  const skipped = ocr === null;

  return (
    <div className={styles.form}>
      <h2 className={styles.h2}>Check the unit number</h2>

      {skipped ? (
        <p className={styles.reviewIntro}>
          No image provided. Type the unit number by hand below.
        </p>
      ) : matchedSomething ? (
        <p className={styles.reviewIntro}>
          We read <strong>{ocr!.unit_number}</strong> off the photo
          {ocr!.size ? <> (looks like a <strong>{ocr!.size}</strong>)</> : null}.
          Fix it below if that's not right.
        </p>
      ) : (
        <p className={styles.reviewIntro}>
          We couldn't pick out a unit number from the photo. Type it by hand below.
        </p>
      )}

      <label className={styles.field}>
        <span className={styles.label}>Unit number</span>
        <input
          type="text"
          value={unitNumber}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="e.g. TRHU2174232"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </label>

      {releaseMatch && (
        <div className={styles.matchBadge}>
          Matched to release <strong>{releaseMatch.release_number_value}</strong>
          {releaseMatch.sale_company_name
            ? <> ({releaseMatch.sale_company_name})</>
            : null}
          . We'll fill that in for you on the next step.
        </div>
      )}

      {ocr && ocr.lines.length > 0 && (
        <details>
          <summary>What the camera saw</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8125rem' }}>
            {ocr.lines.join('\n')}
          </pre>
        </details>
      )}
    </div>
  );
}
