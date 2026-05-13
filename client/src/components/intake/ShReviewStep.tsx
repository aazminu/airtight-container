import styles from './IntakeForm.module.css';
import type { ShIntakeForm } from './ShDetailsStep';

interface Props {
  value: ShIntakeForm;
  clientLabel?: string;
}

export function ShReviewStep({ value, clientLabel }: Props) {
  return (
    <div className={styles.review}>
      <h2 className={styles.h2}>Looks good?</h2>
      <p className={styles.reviewIntro}>
        Hit Submit and we'll log this box. Michelle will review the rates and
        intake date before billing starts.
      </p>

      <dl className={styles.summary}>
        <SummaryRow label="Customer" value={clientLabel ?? '—'} />
        <SummaryRow label="Unit number" value={value.unit_number} />
        <SummaryRow label="Size" value={value.size} />
        <SummaryRow label="Damage" value={value.damage || '—'} />
        <SummaryRow label="Notes" value={value.notes || '—'} />
      </dl>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.summaryRow}>
      <dt className={styles.summaryLabel}>{label}</dt>
      <dd className={styles.summaryValue}>{value}</dd>
    </div>
  );
}
