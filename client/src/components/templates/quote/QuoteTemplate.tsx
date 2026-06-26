import type { QuoteTemplateProps } from './types';
import { fmtCurrency, fmtDate, fmtRate, buildQuoteLineGroups } from './format';
import {
  AIRTIGHT_PARTY,
  BrandHeader,
  BrandSheet,
  Divider,
  DocFooter,
  PartiesBlock,
  type Party,
} from '../shared';
import styles from './QuoteTemplate.module.css';

export default function QuoteTemplate({ data }: QuoteTemplateProps) {
  const groups = buildQuoteLineGroups(data);
  const { customer } = data;
  let lineCounter = 0;

  const toParty: Party = {
    primary: customer.business_name || customer.client_name,
    secondary: customer.business_name ? customer.client_name : null,
    lines: [
      customer.street ?? null,
      [customer.city, customer.state].filter(Boolean).join(', ') +
        (customer.zip ? ' ' + customer.zip : ''),
    ],
    muted: [customer.contact_phone ?? null, customer.contact_email ?? null],
  };

  return (
    <BrandSheet>
      <BrandHeader
        title="Quote"
        meta={[
          { label: 'Number', value: data.quote_number },
          { label: 'Issued', value: fmtDate(data.created_at) },
        ]}
      />

      <Divider />

      <PartiesBlock from={AIRTIGHT_PARTY} to={toParty} />

      <table className={styles.items}>
        <thead>
          <tr>
            <th className={styles.colN}>#</th>
            <th className={styles.colDesc}>Description</th>
            <th className={styles.colPrice}>Unit price</th>
            <th className={styles.colQty}>Qty</th>
            <th className={styles.colTotal}>Amount</th>
          </tr>
        </thead>
        {groups.map((g, gi) => {
            lineCounter += 1;
            const parentNo = lineCounter;
            return (
              <tbody key={gi} className={styles.lineGroup}>
                <tr
                  className={styles.parentRow}
                  data-has-subs={g.subs.length > 0}
                >
                  <td className={styles.colN}>
                    {String(parentNo).padStart(2, '0')}
                  </td>
                  <td className={styles.colDesc}>{g.primary.description}</td>
                  <td className={styles.colPrice}>
                    {g.primary.unitPrice
                      ? fmtCurrency(g.primary.unitPrice)
                      : '—'}
                  </td>
                  <td className={styles.colQty}>{g.primary.qty}</td>
                  <td className={styles.colTotal}>
                    {g.primary.lineTotal
                      ? fmtCurrency(g.primary.lineTotal)
                      : '—'}
                  </td>
                </tr>
                {g.subs.map((sub, si) => (
                  <tr
                    key={si}
                    className={styles.subRow}
                    data-last={si === g.subs.length - 1}
                  >
                    <td className={styles.colN} />
                    <td className={styles.colDesc}>{sub.description}</td>
                    <td className={styles.colPrice}>
                      {sub.unitPrice ? fmtCurrency(sub.unitPrice) : ''}
                    </td>
                    <td className={styles.colQty}>
                      {sub.qty > 1 ? sub.qty : ''}
                    </td>
                    <td className={styles.colTotal}>
                      {sub.lineTotal ? fmtCurrency(sub.lineTotal) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            );
          })}
      </table>

      {data.notes && data.notes.trim() && (
        <section className={styles.notes}>
          <div className={styles.notesTitle}>Notes</div>
          <p>{data.notes}</p>
        </section>
      )}

      <div className={styles.summaryKeep} data-print-keep>
        <section className={styles.summaryRow}>
        <div className={styles.terms}>
          <div className={styles.termsTitle}>Terms</div>
          <p>
            This quote is an estimate and is not a binding invoice. Pricing is
            valid for 30 days from the issue date and is subject to availability.
            All checks are to be certified bank checks payable to{' '}
            <strong>Airtight Storage Systems Inc</strong>.
          </p>
        </div>
        <dl className={styles.totals}>
          <div className={styles.totalLine}>
            <dt>Subtotal</dt>
            <dd>{fmtCurrency(data.subtotal)}</dd>
          </div>
          {data.quote_taxed && (
            <div className={styles.totalLine}>
              <dt>
                Sales tax
                {data.tax_rate ? ` (${fmtRate(data.tax_rate)})` : ''}
              </dt>
              <dd>{fmtCurrency(data.tax_amount)}</dd>
            </div>
          )}
          {data.quote_credit && (
            <div className={styles.totalLine}>
              <dt>
                Credit card fee
                {data.cc_fee_rate ? ` (${fmtRate(data.cc_fee_rate)})` : ''}
              </dt>
              <dd>{fmtCurrency(data.cc_fee_amount)}</dd>
            </div>
          )}
          <div className={`${styles.totalLine} ${styles.grandTotal}`}>
            <dt>Estimated total</dt>
            <dd>{fmtCurrency(data.total)}</dd>
          </div>
        </dl>
        </section>
      </div>

      <DocFooter
        left="Thank you for your business. · Salesperson Michelle"
        right="Airtight Storage Systems Inc · 41 Wilson Avenue · Manalapan, NJ 07726"
      />
    </BrandSheet>
  );
}
