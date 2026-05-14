import {
  AIRTIGHT_PARTY,
  BrandHeader,
  BrandSheet,
  Divider,
  DocFooter,
  PartiesBlock,
  SectionTitle,
  type Party,
} from '../shared';
import type { ShStatementData, ShStatementLine } from './types';
import styles from './ShStatementTemplate.module.css';

const fmtCurrency = (v: number): string =>
  `$${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const fmtMonth = (iso: string): string => {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
};

const statusLabel = (s: ShStatementLine['status']): string =>
  s === 'paid' ? 'Paid' : s === 'sent' ? 'Sent' : 'Pending';

const statusClass = (s: ShStatementLine['status']): string =>
  s === 'paid'
    ? styles.statusPaid
    : s === 'sent'
      ? styles.statusSent
      : styles.statusPending;

export default function ShStatementTemplate({
  data,
}: {
  data: ShStatementData;
}) {
  const { client } = data;

  const toParty: Party = {
    primary: client.business_name || client.client_name,
    secondary: client.business_name ? client.client_name : null,
    lines: [
      client.street,
      [client.city, client.state].filter(Boolean).join(', ') +
        (client.zip ? ' ' + client.zip : ''),
    ],
    muted: [client.contact_phone, client.contact_email],
  };

  const window =
    data.start_date && data.end_date
      ? `${fmtDate(data.start_date)} – ${fmtDate(data.end_date)}`
      : data.start_date
        ? `From ${fmtDate(data.start_date)}`
        : data.end_date
          ? `Through ${fmtDate(data.end_date)}`
          : 'All time';

  return (
    <BrandSheet>
      <BrandHeader
        title="S & H Statement"
        titleSize="sm"
        meta={[
          { label: 'Number', value: data.report_id },
          { label: 'Issued', value: fmtDate(data.generated_at) },
          { label: 'Window', value: window },
        ]}
      />

      <Divider />

      <PartiesBlock from={AIRTIGHT_PARTY} to={toParty} />

      <SectionTitle>Monthly Activity</SectionTitle>

      <table className={styles.invoiceTable}>
        <thead>
          <tr>
            <th className={styles.colMonth}>Month</th>
            <th className={styles.colInvoice}>Invoice #</th>
            <th className={styles.colStatus}>Status</th>
            <th className={styles.colNum}>In-fees</th>
            <th className={styles.colNum}>Out-fees</th>
            <th className={styles.colNum}>Storage</th>
            <th className={styles.colTotal}>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l) => (
            <tr key={l.invoice_number}>
              <td className={styles.colMonth}>{fmtMonth(l.billing_month)}</td>
              <td className={styles.colInvoice}>{l.invoice_number}</td>
              <td className={styles.colStatus}>
                <span
                  className={`${styles.statusBadge} ${statusClass(l.status)}`}
                >
                  {statusLabel(l.status)}
                </span>
              </td>
              <td className={styles.colNum}>{fmtCurrency(l.in_fee)}</td>
              <td className={styles.colNum}>{fmtCurrency(l.out_fee)}</td>
              <td className={styles.colNum}>{fmtCurrency(l.storage_days)}</td>
              <td className={styles.colTotal}>{fmtCurrency(l.total)}</td>
            </tr>
          ))}
          {data.lines.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', padding: '14px' }}>
                No S&amp;H invoices for this client in the selected window.
              </td>
            </tr>
          )}
        </tbody>
        {data.lines.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={3}>Totals</td>
              <td className={styles.colNum}>{fmtCurrency(data.totals.in_fee)}</td>
              <td className={styles.colNum}>
                {fmtCurrency(data.totals.out_fee)}
              </td>
              <td className={styles.colNum}>
                {fmtCurrency(data.totals.storage_days)}
              </td>
              <td className={styles.colTotal}>
                {fmtCurrency(data.totals.total)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      <div className={styles.summary}>
        <dl className={styles.summaryBox}>
          <div className={styles.summaryLine}>
            <dt>In-fees</dt>
            <dd>{fmtCurrency(data.totals.in_fee)}</dd>
          </div>
          <div className={styles.summaryLine}>
            <dt>Out-fees</dt>
            <dd>{fmtCurrency(data.totals.out_fee)}</dd>
          </div>
          <div className={styles.summaryLine}>
            <dt>Storage</dt>
            <dd>{fmtCurrency(data.totals.storage_days)}</dd>
          </div>
          <div className={`${styles.summaryLine} ${styles.summaryTotal}`}>
            <dt>Total</dt>
            <dd>{fmtCurrency(data.totals.total)}</dd>
          </div>
        </dl>
      </div>

      <DocFooter
        left="Questions? michelle@airtightstorage.com · 732-792-8111"
      />
    </BrandSheet>
  );
}
