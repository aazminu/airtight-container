import {
  BrandHeader,
  BrandSheet,
  Divider,
  DocFooter,
  SectionTitle,
} from '../shared';
import type { IOReportData, IOReportRow } from './types';
import styles from './IOReportTemplate.module.css';

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export default function IOReportTemplate({ data }: { data: IOReportData }) {
  return (
    <BrandSheet>
      <BrandHeader
        title="I / O Report"
        titleSize="sm"
        meta={[
          { label: 'Number', value: data.report_id },
          { label: 'Issued', value: fmtDate(data.generated_at) },
          {
            label: 'Window',
            value: `${fmtDate(data.start_date)} – ${fmtDate(data.end_date)}`,
          },
        ]}
      />

      <Divider />

      <section className={styles.section}>
        <SectionTitle>Inbound</SectionTitle>
        <div className={styles.countBanner}>
          <span className={styles.countLabel}>Containers</span>
          <span className={styles.countValue}>{data.inbound.length}</span>
        </div>
        <Rows rows={data.inbound} kind="inbound" />
      </section>

      <section className={styles.section}>
        <SectionTitle>Outbound</SectionTitle>
        <div className={styles.countBanner}>
          <span className={styles.countLabel}>Containers</span>
          <span className={styles.countValue}>{data.outbound.length}</span>
        </div>
        <Rows rows={data.outbound} kind="outbound" />
      </section>

      <DocFooter />
    </BrandSheet>
  );
}

function Rows({
  rows,
  kind,
}: {
  rows: IOReportRow[];
  kind: 'inbound' | 'outbound';
}) {
  if (rows.length === 0) {
    return (
      <div className={styles.emptyRow}>
        No {kind} containers in this date window.
      </div>
    );
  }
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.colUnit}>Unit #</th>
          <th className={styles.colSize}>Size</th>
          <th className={styles.colDate}>Date</th>
          <th className={styles.colParty}>
            {kind === 'inbound' ? 'Sale Company' : 'Customer / Destination'}
          </th>
          <th className={styles.colRelease}>Release #</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className={styles.colUnit}>{r.unit_number.trim()}</td>
            <td className={styles.colSize}>{r.size}</td>
            <td className={styles.colDate}>{fmtDate(r.date)}</td>
            <td className={styles.colParty}>{r.party}</td>
            <td className={styles.colRelease}>
              {r.release_number_value ?? '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
