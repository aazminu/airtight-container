import {
  BrandHeader,
  BrandSheet,
  Divider,
  DocFooter,
  SectionTitle,
} from '../shared';
import type { IOReportData, IOReportRow, IOReportSource } from './types';
import styles from './IOReportTemplate.module.css';

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const SOURCE_LABELS: Record<IOReportSource, { inbound: string; outbound: string }> = {
  sales: { inbound: 'Sales — releases inbound', outbound: 'Sales — sold containers out' },
  sh: { inbound: 'Storage & Handling — check-ins', outbound: 'Storage & Handling — pickups' },
};

export default function IOReportTemplate({ data }: { data: IOReportData }) {
  return (
    <BrandSheet>
      <BrandHeader
        title="In / Out"
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
          <span className={styles.countLabel}>Total</span>
          <span className={styles.countValue}>{data.inbound.length}</span>
        </div>
        <GroupedRows rows={data.inbound} kind="inbound" />
      </section>

      <section className={styles.section}>
        <SectionTitle>Outbound</SectionTitle>
        <div className={styles.countBanner}>
          <span className={styles.countLabel}>Total</span>
          <span className={styles.countValue}>{data.outbound.length}</span>
        </div>
        <GroupedRows rows={data.outbound} kind="outbound" />
      </section>

      <DocFooter />
    </BrandSheet>
  );
}

function GroupedRows({
  rows,
  kind,
}: {
  rows: IOReportRow[];
  kind: 'inbound' | 'outbound';
}) {
  if (rows.length === 0) {
    return (
      <div className={styles.emptyRow}>
        No {kind} activity in this date window.
      </div>
    );
  }

  // Render sales first, then S&H. Skip empty groups.
  const order: IOReportSource[] = ['sales', 'sh'];
  const groups = order
    .map((source) => ({ source, rows: rows.filter((r) => r.source === source) }))
    .filter((g) => g.rows.length > 0);

  return (
    <>
      {groups.map(({ source, rows: groupRows }) => (
        <div key={source}>
          <div className={styles.sourceLabel}>{SOURCE_LABELS[source][kind]}</div>
          <table className={styles.subTable}>
            <thead>
              <tr>
                <th className={styles.colUnit}>Unit #</th>
                <th className={styles.colSize}>Size</th>
                <th className={styles.colDate}>Date</th>
                <th className={styles.colParty}>
                  {source === 'sales'
                    ? kind === 'inbound'
                      ? 'Sale Company'
                      : 'Customer / Destination'
                    : 'Client'}
                </th>
                <th className={styles.colRelease}>Release #</th>
              </tr>
            </thead>
            <tbody>
              {groupRows.map((r, i) => (
                <tr key={`${source}-${i}`}>
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
        </div>
      ))}
    </>
  );
}
