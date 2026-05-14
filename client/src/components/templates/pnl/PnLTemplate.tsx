import {
  BrandHeader,
  BrandSheet,
  Divider,
  DocFooter,
  SectionTitle,
} from '../shared';
import type { PnLData } from './types';
import styles from './PnLTemplate.module.css';

const fmtCurrency = (v: number): string =>
  `$${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

export default function PnLTemplate({ data }: { data: PnLData }) {
  const salesProfit = data.sales.revenue - data.sales.cost;
  const modProfit = data.sales.mod_revenue - data.sales.mod_cost;
  const grandProfit = salesProfit + modProfit + data.sh.revenue;

  return (
    <BrandSheet>
      <BrandHeader
        title="Profit + Loss"
        titleSize="sm"
        meta={[
          { label: 'Number', value: data.report_id },
          { label: 'Issued', value: fmtDate(data.generated_at) },
          { label: 'Period', value: data.period_label },
        ]}
      />

      <Divider />

      <div className={styles.summaryCards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Sales Revenue</span>
          <span className={styles.cardValue}>
            {fmtCurrency(data.sales.revenue + data.sales.mod_revenue)}
          </span>
          <span className={styles.cardSubtle}>
            {data.sales.container_count} container
            {data.sales.container_count === 1 ? '' : 's'}
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Sales Cost</span>
          <span className={styles.cardValue}>
            {fmtCurrency(data.sales.cost + data.sales.mod_cost)}
          </span>
          <span className={styles.cardSubtle}>
            Container + modification cost
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Net Profit</span>
          <span
            className={`${styles.cardValue} ${
              grandProfit >= 0 ? styles.profit : styles.loss
            }`}
          >
            {fmtCurrency(grandProfit)}
          </span>
          <span className={styles.cardSubtle}>Sales + S&H combined</span>
        </div>
      </div>

      <section className={styles.section}>
        <SectionTitle>Sales</SectionTitle>
        <table className={styles.lineTable}>
          <tbody>
            <tr>
              <td className={styles.lineLabel}>Container revenue</td>
              <td className={styles.lineValue}>
                {fmtCurrency(data.sales.revenue)}
              </td>
            </tr>
            <tr>
              <td className={styles.lineLabel}>Container cost (acquisition)</td>
              <td className={styles.lineValue}>
                {fmtCurrency(data.sales.cost)}
              </td>
            </tr>
            <tr>
              <td className={styles.lineLabel}>Modification revenue</td>
              <td className={styles.lineValue}>
                {fmtCurrency(data.sales.mod_revenue)}
              </td>
            </tr>
            <tr>
              <td className={styles.lineLabel}>
                Modification cost (material + labor)
              </td>
              <td className={styles.lineValue}>
                {fmtCurrency(data.sales.mod_cost)}
              </td>
            </tr>
            <tr className={styles.subtleRow}>
              <td className={styles.lineLabel}>
                Trucking pass-through (not in profit)
              </td>
              <td className={styles.lineValue}>
                {fmtCurrency(data.sales.trucking)}
              </td>
            </tr>
            <tr>
              <td className={styles.lineLabel}>
                <strong>Sales profit</strong>
              </td>
              <td
                className={`${styles.lineValue} ${
                  salesProfit + modProfit >= 0 ? styles.profit : styles.loss
                }`}
              >
                <strong>{fmtCurrency(salesProfit + modProfit)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <SectionTitle>Storage &amp; Handling</SectionTitle>
        <table className={styles.lineTable}>
          <tbody>
            <tr>
              <td className={styles.lineLabel}>In-fees</td>
              <td className={styles.lineValue}>{fmtCurrency(data.sh.in_fee)}</td>
            </tr>
            <tr>
              <td className={styles.lineLabel}>Out-fees</td>
              <td className={styles.lineValue}>
                {fmtCurrency(data.sh.out_fee)}
              </td>
            </tr>
            <tr>
              <td className={styles.lineLabel}>Storage days</td>
              <td className={styles.lineValue}>
                {fmtCurrency(data.sh.storage_days)}
              </td>
            </tr>
            <tr className={styles.subtleRow}>
              <td className={styles.lineLabel}>Distinct clients with activity</td>
              <td className={styles.lineValue}>{data.sh.client_count}</td>
            </tr>
            <tr>
              <td className={styles.lineLabel}>
                <strong>S&amp;H revenue</strong>
              </td>
              <td className={`${styles.lineValue} ${styles.profit}`}>
                <strong>{fmtCurrency(data.sh.revenue)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <table className={styles.lineTable}>
        <tbody>
          <tr className={styles.grandRow}>
            <td className={styles.lineLabel}>Net profit · {data.period_label}</td>
            <td
              className={`${styles.lineValue} ${
                grandProfit >= 0 ? styles.profit : styles.loss
              }`}
            >
              {fmtCurrency(grandProfit)}
            </td>
          </tr>
        </tbody>
      </table>

      <DocFooter
        left={`Internal report · generated ${fmtDate(data.generated_at)}`}
      />
    </BrandSheet>
  );
}
