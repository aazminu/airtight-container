import {
  AIRTIGHT_PARTY,
  Banner,
  BrandHeader,
  BrandSheet,
  Divider,
  DocFooter,
  PartiesBlock,
  SectionTitle,
  type Party,
} from '../shared';
import type { DeliveryData } from './types';
import styles from './DeliveryTemplate.module.css';

const fmtCurrency = (v: number | string | null | undefined): string => {
  if (v == null || v === '') return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export default function DeliveryTemplate({ data }: { data: DeliveryData }) {
  const { customer, container } = data;

  const toParty: Party = {
    primary: customer.business_name || customer.client_name,
    secondary: customer.business_name ? customer.client_name : null,
    lines: [
      customer.street,
      [customer.city, customer.state].filter(Boolean).join(', ') +
        (customer.zip ? ' ' + customer.zip : ''),
    ],
    muted: [customer.contact_phone, customer.contact_email],
  };

  return (
    <BrandSheet>
      <BrandHeader
        title="Delivery"
        meta={[
          { label: 'Number', value: data.delivery_id },
          { label: 'Issued', value: fmtDate(data.generated_at) },
          ...(data.outbound_date
            ? [{ label: 'Outbound', value: fmtDate(data.outbound_date) }]
            : []),
        ]}
      />

      <Divider />

      <PartiesBlock from={AIRTIGHT_PARTY} to={toParty} />

      <Banner label="Deliver to" value={data.destination} />

      <SectionTitle>Container</SectionTitle>

      <div className={styles.containerRow}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Unit Number</span>
          <span className={`${styles.fieldValue} ${styles.mono}`}>
            {container.unit_number.trim()}
          </span>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Size</span>
          <span className={styles.fieldValue}>{container.size}</span>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Condition</span>
          <span className={styles.fieldValue}>{container.damage ?? '—'}</span>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Release #</span>
          <span className={styles.fieldValue}>
            {container.release_number_value ?? '—'}
          </span>
        </div>
      </div>

      {data.modifications.length > 0 && (
        <>
          <SectionTitle>Modifications</SectionTitle>
          <table className={styles.modList}>
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Price</th>
              </tr>
            </thead>
            <tbody>
              {data.modifications.map((m, i) => (
                <tr key={i}>
                  <td>{m.description}</td>
                  <td style={{ textAlign: 'right' }}>
                    {fmtCurrency(m.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {data.notes && (
        <div className={styles.notesBlock}>
          <div className={styles.notesLabel}>Notes</div>
          <div>{data.notes}</div>
        </div>
      )}

      <div className={styles.signatureRow}>
        <div className={styles.signatureField}>
          <div className={styles.signatureLine} />
          <span className={styles.signatureLabel}>
            Driver Signature{data.trucker ? ` — ${data.trucker}` : ''}
          </span>
        </div>
        <div className={styles.signatureField}>
          <div className={styles.signatureLine} />
          <span className={styles.signatureLabel}>Recipient Signature</span>
        </div>
      </div>

      <DocFooter
        left="Sign on receipt. Photograph any damage before unloading."
        right="airtightshippingcontainer.com · 732-792-8111"
      />
    </BrandSheet>
  );
}
