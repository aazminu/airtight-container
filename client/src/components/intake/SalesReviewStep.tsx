import styles from './IntakeForm.module.css';
import type { SalesIntakeForm } from './SalesDetailsStep';

interface Props {
  value: SalesIntakeForm;
  releaseLabel?: string;
}

export function SalesReviewStep({ value, releaseLabel }: Props) {
  return (
    <div className={styles.review}>
      <h2 className={styles.h2}>Looks good?</h2>
      <p className={styles.reviewIntro}>
        Hit Submit and we'll log this box. Michelle will review the details and
        confirm the price before it's available.
      </p>

      <dl className={styles.summary}>
        <SummaryRow label="Unit number" value={value.unit_number} />
        <SummaryRow label="Size" value={value.size} />
        <SummaryRow label="Damage" value={value.damage} />
        <SummaryRow label="Release" value={releaseLabel ?? '—'} />
        <SummaryRow label="Trucking company" value={value.trucking_company || '—'} />
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
