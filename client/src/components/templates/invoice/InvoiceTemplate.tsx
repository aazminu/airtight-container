import { Fragment } from 'react';
import type { InvoiceTemplateProps } from './types';
import {
  fmtCurrency,
  fmtDate,
  fmtRate,
  buildLineGroups,
  headlineDestination,
} from './format';
import logoSrc from '../../../assets/images/airtightfixed.png';
import styles from './InvoiceTemplate.module.css';

export default function InvoiceTemplate({ data }: InvoiceTemplateProps) {
  const groups = buildLineGroups(data);
  const deliver = headlineDestination(data);
  const { customer } = data;
  let lineCounter = 0;

  return (
    <div className={styles.sheet}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img
            src={logoSrc}
            alt="Airtight Storage Systems"
            className={styles.logo}
          />
        </div>
        <div className={styles.invoiceMeta}>
          <div className={styles.invoiceWord}>Invoice</div>
          <dl className={styles.metaList}>
            <div className={styles.metaRow}>
              <dt>Number</dt>
              <dd>{data.invoice_number}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Issued</dt>
              <dd>{fmtDate(data.invoice_date)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <hr className={styles.divider} />

      <section className={styles.parties}>
        <div className={styles.partyBlock}>
          <div className={styles.partyName}>Airtight Storage Systems Inc</div>
          <div className={styles.partyLine}>41 Wilson Avenue</div>
          <div className={styles.partyLine}>Manalapan, NJ 07726</div>
          <div className={styles.partyLineMuted}>732-792-8111</div>
          <div className={styles.partyLineMuted}>
            michelle@airtightstorage.com
          </div>
        </div>
        <div className={styles.toWord}>To</div>
        <div className={styles.partyBlock}>
          {customer.business_name && (
            <div className={styles.partyName}>{customer.business_name}</div>
          )}
          <div
            className={
              customer.business_name ? styles.partyLineMuted : styles.partyName
            }
          >
            {customer.client_name}
          </div>
          {customer.street && (
            <div className={styles.partyLine}>{customer.street}</div>
          )}
          {(customer.city || customer.state || customer.zip) && (
            <div className={styles.partyLine}>
              {[customer.city, customer.state].filter(Boolean).join(', ')}
              {customer.zip ? ' ' + customer.zip : ''}
            </div>
          )}
          {customer.contact_phone && (
            <div className={styles.partyLineMuted}>
              {customer.contact_phone}
            </div>
          )}
          {customer.contact_email && (
            <div className={styles.partyLineMuted}>
              {customer.contact_email}
            </div>
          )}
        </div>
      </section>

      {deliver && (
        <div className={styles.deliverBanner}>
          <span className={styles.deliverLabel}>Deliver to</span>
          <span className={styles.deliverValue}>{deliver}</span>
        </div>
      )}

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
                    <td className={styles.colQty} />
                    <td className={styles.colDesc}>{sub.description}</td>
                    <td className={styles.colPrice} />
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

      <footer className={styles.footer}>
        <div>Thank you for your business. · Salesperson Michelle</div>
        <div>
          Airtight Storage Systems Inc · 41 Wilson Avenue · Manalapan, NJ 07726
        </div>
      </footer>
    </div>
  );
}
