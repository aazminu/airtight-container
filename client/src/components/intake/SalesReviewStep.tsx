import { useTranslation } from 'react-i18next';
import styles from './IntakeForm.module.css';
import type { SalesIntakeForm } from './SalesDetailsStep';

interface Props {
  value: SalesIntakeForm;
  releaseLabel?: string;
}

export function SalesReviewStep({ value, releaseLabel }: Props) {
  const { t } = useTranslation();
  return (
    <div className={styles.review}>
      <h2 className={styles.h2}>{t('review.heading')}</h2>
      <p className={styles.reviewIntro}>
        {t('review.sales_intro')}
      </p>

      <dl className={styles.summary}>
        <SummaryRow label={t('review.unit')} value={value.unit_number} />
        <SummaryRow label={t('review.size')} value={value.size} />
        <SummaryRow label={t('review.damage')} value={value.damage} />
        <SummaryRow label={t('review.release')} value={releaseLabel ?? '—'} />
        <SummaryRow label={t('review.trucking')} value={value.trucking_company || '—'} />
        <SummaryRow label={t('review.notes')} value={value.notes || '—'} />
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
