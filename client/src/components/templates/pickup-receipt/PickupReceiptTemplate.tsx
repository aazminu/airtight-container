// Compact 80mm thermal receipt for Storage & Handling pickups.
//
// Sibling to DeliveryReceiptTemplate. Same paper size, no signature
// block by default (the customer hauls their own box; no driver
// hand-off), no carrier or doors. Damage at pickup is the operator's
// free-text field captured at outbound.

import styles from './PickupReceiptTemplate.module.css';

const fmtDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
};

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
};

export interface PickupReceiptData {
  sh_inventory_id: number;
  unit_number: string;
  size: string;
  damage: string | null;
  intake_date: string;
  checkout_date: string | null;
  pickup_damage: string | null;
  customer: {
    client_name: string | null;
    business_name: string | null;
  };
  sale_company_name: string | null;
  pickup_number_value: string | null;
}

interface Props {
  data: PickupReceiptData;
}

export default function PickupReceiptTemplate({ data }: Props) {
  const customerName =
    data.customer.business_name || data.customer.client_name || 'Customer';

  return (
    <div className={styles.receipt}>
      <header className={styles.header}>
        <div className={styles.brand}>AIRTIGHT CONTAINER</div>
        <div className={styles.tagline}>Manalapan, NJ</div>
        <div className={styles.docTitle}>PICKUP RECEIPT</div>
      </header>

      {data.pickup_number_value && (
        <div className={styles.metaRow}>
          <span className={styles.label}>Pickup Number</span>
          <span className={styles.value}>{data.pickup_number_value}</span>
        </div>
      )}
      <div className={styles.metaRow}>
        <span className={styles.label}>Printed</span>
        <span className={styles.value}>{fmtDateTime(new Date().toISOString())}</span>
      </div>

      <hr className={styles.rule} />

      <div className={styles.unitBlock}>
        <div className={styles.label}>Container</div>
        <div className={styles.unitNumber}>{data.unit_number.trim()}</div>
        <div className={styles.unitSpec}>
          {[data.size, data.damage].filter(Boolean).join(' · ')}
        </div>
      </div>

      <hr className={styles.rule} />

      <div className={styles.block}>
        <div className={styles.label}>Customer</div>
        <div className={styles.value}>{customerName}</div>
      </div>

      {data.sale_company_name && (
        <div className={styles.metaRow}>
          <span className={styles.label}>Pickup Co.</span>
          <span className={styles.value}>{data.sale_company_name}</span>
        </div>
      )}

      <div className={styles.metaRow}>
        <span className={styles.label}>Intake</span>
        <span className={styles.value}>{fmtDate(data.intake_date)}</span>
      </div>

      <hr className={styles.rule} />

      <div className={styles.block}>
        <div className={styles.label}>Damage at pickup</div>
        <div className={styles.value}>{data.pickup_damage ?? 'Out good'}</div>
      </div>

      <hr className={styles.rule} />

      <div className={styles.sigBlock}>
        <div className={styles.sigLine}></div>
        <div className={styles.label}>Customer signature</div>
      </div>

      <div className={styles.footer}>Received in good order. Thank you.</div>
    </div>
  );
}
