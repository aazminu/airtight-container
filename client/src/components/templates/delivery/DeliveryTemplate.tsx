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

const fmtDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })} · ${d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  })}`;
};

export default function DeliveryTemplate({ data }: { data: DeliveryData }) {
  const { customer, container, delivery_address: addr } = data;

  // The TO party is the recipient at the delivery site. We prefer the
  // delivery-address overrides over the customer of record, since the
  // legacy doc warned these may differ.
  const toParty: Party = {
    primary:
      addr.name ||
      customer.business_name ||
      customer.client_name,
    secondary: addr.name && customer.business_name ? customer.client_name : null,
    lines: [addr.street, addr.locality],
    muted: [customer.contact_phone, customer.contact_email],
  };

  return (
    <BrandSheet>
      <BrandHeader
        title="Delivery"
        meta={[
          { label: 'Number', value: data.delivery_id },
          { label: 'Issued', value: fmtDate(data.generated_at) },
          { label: 'Delivery', value: fmtDateTime(data.delivery_date) },
        ]}
      />

      <Divider />

      <PartiesBlock from={AIRTIGHT_PARTY} to={toParty} connector="Deliver to" />

      {data.receipt_note && (
        <Banner label="Receipt" value={data.receipt_note} />
      )}

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

      <div className={styles.receiptSummary}>
        <span className={styles.receiptSummaryLabel}>Delivery receipt</span>
        <span className={styles.receiptSummaryValue}>
          {container.receipt_summary}
        </span>
      </div>

      <SectionTitle>Delivery</SectionTitle>

      <dl className={styles.detailGrid}>
        <DetailLine label="Delivery company" value={data.delivery_company} />
        <DetailLine label="On-site contact" value={data.onsite_contact} />
        <DetailLine
          label="Door orientation"
          value={data.door_orientation}
        />
        <DetailLine
          label="Payment pickup"
          value={data.payment_details}
          wide
        />
      </dl>

      <div className={styles.pickupRow}>
        <div className={styles.pickupBlock}>
          <span className={styles.pickupLabel}>Pickup location</span>
          <span className={styles.pickupValue}>
            Airtight Storage · 41 Wilson Avenue · Manalapan, NJ 07726
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

      <p className={styles.disclaimer}>
        ** Container was received in good working order per specifications at
        the time of delivery.
      </p>

      <div className={styles.signatureRow}>
        <div className={styles.signatureField}>
          <div className={styles.signatureLine} />
          <span className={styles.signatureLabel}>By</span>
        </div>
        <div className={styles.signatureField}>
          <div className={styles.signatureLine} />
          <span className={styles.signatureLabel}>Signature · Date</span>
        </div>
        <div className={styles.signatureField}>
          <div className={styles.signatureLine} />
          <span className={styles.signatureLabel}>Print name · Date</span>
        </div>
      </div>

      <DocFooter
        left="Sign on receipt. Photograph any damage before unloading."
        right="airtightshippingcontainer.com · 732-792-8111"
      />
    </BrandSheet>
  );
}

function DetailLine({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <div
      className={`${styles.detailLine} ${wide ? styles.detailLineWide : ''}`}
    >
      <dt className={styles.detailLineLabel}>{label}</dt>
      <dd className={styles.detailLineValue}>{value ?? '—'}</dd>
    </div>
  );
}
