import {
  BrandHeader,
  BrandSheet,
  Divider,
  DocFooter,
  SectionTitle,
} from '../shared';
import type { ReleaseSummaryData } from './types';
import styles from './ReleaseSummaryTemplate.module.css';

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const STATE_LABELS: Record<string, string> = {
  available: 'Available',
  hold: 'On hold',
  sold: 'Sold',
  outbound: 'Outbound',
  pending: 'Pending audit',
};

export default function ReleaseSummaryTemplate({
  data,
}: {
  data: ReleaseSummaryData;
}) {
  const { quota, filled_count: filled, remaining } = data;
  const pct = quota > 0 ? Math.min(100, (filled / quota) * 100) : 0;

  return (
    <BrandSheet>
      <BrandHeader
        title="Release Summary"
        titleSize="sm"
        meta={[
          { label: 'Number', value: data.report_id },
          { label: 'Issued', value: fmtDate(data.generated_at) },
          { label: 'Release', value: data.release_number_value },
          { label: 'Company', value: data.sale_company_name },
        ]}
      />

      <Divider />

      <div className={styles.summaryCards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Filled</span>
          <span className={styles.cardValue}>
            {filled} <span className={styles.cardOver}>/ {quota}</span>
          </span>
          <span className={styles.cardSubtle}>
            {filled === 1 ? 'container' : 'containers'} logged under this release
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Remaining</span>
          <span className={styles.cardValue}>{remaining}</span>
          <span className={styles.cardSubtle}>
            {remaining === 1 ? 'box' : 'boxes'} still expected at the yard
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Progress</span>
          <span className={styles.cardValue}>{Math.round(pct)}%</span>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <SectionTitle>Containers</SectionTitle>

      {data.containers.length === 0 ? (
        <div className={styles.empty}>
          No containers logged under this release yet.
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colUnit}>Unit #</th>
              <th className={styles.colSize}>Size</th>
              <th className={styles.colCondition}>Condition</th>
              <th className={styles.colState}>State</th>
              <th className={styles.colIntake}>Intake</th>
              <th className={styles.colOut}>Outbound · Buyer</th>
            </tr>
          </thead>
          <tbody>
            {data.containers.map((c, i) => (
              <tr key={i}>
                <td className={styles.colUnit}>{c.unit_number.trim()}</td>
                <td className={styles.colSize}>{c.size}</td>
                <td className={styles.colCondition}>{c.damage ?? '—'}</td>
                <td className={styles.colState}>
                  {STATE_LABELS[c.state] ?? c.state}
                </td>
                <td className={styles.colIntake}>{fmtDate(c.intake_date)}</td>
                <td className={styles.colOut}>
                  {c.outbound_date ? (
                    <>
                      <span className={styles.outDate}>
                        {fmtDate(c.outbound_date)}
                      </span>
                      {c.buyer_label ? (
                        <span className={styles.outBuyer}>{c.buyer_label}</span>
                      ) : null}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data.is_complete && data.completed_at && (
        <p className={styles.archivedFootnote}>
          Note: this release was archived on{' '}
          {fmtDate(data.completed_at)} and is no longer accepting new intake.
        </p>
      )}

      <DocFooter
        left={`Internal report · generated ${fmtDate(data.generated_at)}`}
      />
    </BrandSheet>
  );
}
