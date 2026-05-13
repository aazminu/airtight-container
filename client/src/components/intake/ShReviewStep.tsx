import styles from './IntakeForm.module.css';
import type { ShIntakeForm } from './ShDetailsStep';

interface Props {
  value: ShIntakeForm;
  clientLabel?: string;
}

export function ShReviewStep({ value, clientLabel }: Props) {
  return (
    <div className={styles.review}>
      <h2 className={styles.h2}>Review</h2>
      <p className={styles.reviewIntro}>
        Submitting this box marks it <strong>pending audit</strong>. An admin will
        confirm the rates and intake date before it starts accruing storage days.
      </p>

      <dl className={styles.summary}>
        <SummaryRow label="Client" value={clientLabel ?? '—'} />
        <SummaryRow label="Unit number" value={value.unit_number} />
        <SummaryRow label="Size" value={value.size} />
        <SummaryRow label="Damage" value={value.damage || '—'} />
        <SummaryRow label="In fee" value={value.in_fee ? `$${value.in_fee}` : '—'} />
        <SummaryRow label="Out fee" value={value.out_fee ? `$${value.out_fee}` : '—'} />
        <SummaryRow
          label="Daily rate"
          value={value.daily_rate ? `$${value.daily_rate}` : '—'}
        />
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
