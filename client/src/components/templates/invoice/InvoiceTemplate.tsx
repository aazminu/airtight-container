import { Fragment } from 'react';
import type { InvoiceTemplateProps } from './types';
import {
  fmtCurrency,
  fmtDate,
  fmtRate,
  buildLineGroups,
  headlineDestination,
} from './format';
import {
  AIRTIGHT_PARTY,
  Banner,
  BrandHeader,
  BrandSheet,
  Divider,
  DocFooter,
  PartiesBlock,
  type Party,
} from '../shared';
import styles from './InvoiceTemplate.module.css';

export default function InvoiceTemplate({ data }: InvoiceTemplateProps) {
  const groups = buildLineGroups(data);
  const deliver = headlineDestination(data);
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
        title="Invoice"
        meta={[
          { label: 'Number', value: data.invoice_number },
          { label: 'Issued', value: fmtDate(data.invoice_date) },
        ]}
      />

      <Divider />

      <PartiesBlock from={AIRTIGHT_PARTY} to={toParty} />

      {deliver && <Banner label="Deliver to" value={deliver} />}

      <table className={styles.items}>
        <thead>
          <tr>
            <th className={styles.colN}>#</th>
            <th className={styles.colQty}>Qty</th>
            <th className={styles.colDesc}>Description</th>
            <th className={styles.colPrice}>Unit price</th>
            <th className={styles.colTotal}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => {
            lineCounter += 1;
            const parentNo = lineCounter;
            return (
              <Fragment key={gi}>
                <tr
                  className={styles.parentRow}
                  data-has-subs={g.subs.length > 0}
                >
                  <td className={styles.colN}>
                    {String(parentNo).padStart(2, '0')}
                  </td>
                  <td className={styles.colQty}>{g.primary.qty}</td>
                  <td className={styles.colDesc}>{g.primary.description}</td>
                  <td className={styles.colPrice}>
                    {g.primary.unitPrice
                      ? fmtCurrency(g.primary.unitPrice)
                      : '—'}
                  </td>
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
                    <td className={styles.colQty}>
                      {sub.qty > 1 ? sub.qty : ''}
                    </td>
                    <td className={styles.colDesc}>{sub.description}</td>
                    <td className={styles.colPrice}>
                      {sub.unitPrice ? fmtCurrency(sub.unitPrice) : ''}
                    </td>
                    <td className={styles.colTotal}>
                      {sub.lineTotal ? fmtCurrency(sub.lineTotal) : '—'}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <section className={styles.summaryRow}>
        <div className={styles.terms}>
          <div className={styles.termsTitle}>Terms</div>
          <p>
            Payment due on receipt. All sales are final. No refunds or exchanges
            of any kind. All checks are to be certified bank checks payable to{' '}
            <strong>Airtight Storage Systems Inc</strong>.
          </p>
        </div>
        <dl className={styles.totals}>
          <div className={styles.totalLine}>
            <dt>Subtotal</dt>
            <dd>{fmtCurrency(data.subtotal)}</dd>
          </div>
          {data.invoice_taxed && (
            <div className={styles.totalLine}>
              <dt>
                Sales tax
                {data.tax_rate ? ` (${fmtRate(data.tax_rate)})` : ''}
              </dt>
              <dd>{fmtCurrency(data.tax_amount)}</dd>
            </div>
          )}
          {data.invoice_credit && (
            <div className={styles.totalLine}>
              <dt>
                Credit card fee
                {data.cc_fee_rate ? ` (${fmtRate(data.cc_fee_rate)})` : ''}
              </dt>
              <dd>{fmtCurrency(data.cc_fee_amount)}</dd>
            </div>
          )}
          <div className={`${styles.totalLine} ${styles.grandTotal}`}>
            <dt>Total due</dt>
            <dd>{fmtCurrency(data.total)}</dd>
          </div>
        </dl>
      </section>

      <DocFooter
        left="Thank you for your business. · Salesperson Michelle"
        right="Airtight Storage Systems Inc · 41 Wilson Avenue · Manalapan, NJ 07726"
      />
    </BrandSheet>
  );
}
