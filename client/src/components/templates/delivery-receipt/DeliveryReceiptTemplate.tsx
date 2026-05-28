// Compact 80mm thermal-receipt format of the delivery sheet.
//
// Sibling to the letter-format DeliveryTemplate. Same data shape; the
// letter version is what gets emailed / saved as PDF, this version is
// what AirPrints to the Star TSP654II at the gate.
//
// Layout rules:
//   - Single column, ~72mm content width inside 80mm paper.
//   - Vertical stack only; no side-by-side blocks (won't fit).
//   - System fonts only — thermal printers render fastest with the
//     default sans-serif and Archivo/IBM Plex would slow the print.
//   - Black ink on white; no decorative banners or accent bars (these
//     look terrible at 203 DPI thermal and waste paper).
//   - All text fits on one ~150-200mm tear-off.

import type { DeliveryData } from '../delivery/types';
import { formatUnitNumber } from '../../../lib/unitNumber';
import styles from './DeliveryReceiptTemplate.module.css';

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

interface Props {
  data: DeliveryData;
}

export default function DeliveryReceiptTemplate({ data }: Props) {
  const customerName =
    data.customer.business_name || data.customer.client_name || 'Customer';
  const deliverToName = data.delivery_address.name || customerName;
  const deliverToStreet = data.delivery_address.street || '—';
  const deliverToLocality = data.delivery_address.locality || '';
  const driverName = data.driver_contact?.name;
  const carrier = data.trucking?.company_name ?? null;

  return (
    <div className={styles.receipt}>
      <header className={styles.header}>
        <div className={styles.brand}>AIRTIGHT CONTAINER</div>
        <div className={styles.tagline}>Manalapan, NJ</div>
        <div className={styles.docTitle}>DELIVERY RECEIPT</div>
      </header>

      <div className={styles.metaRow}>
        <span className={styles.label}>Sheet</span>
        <span className={styles.value}>
          {data.delivery_sheet_number ?? `#${data.delivery_id}`}
        </span>
      </div>
      <div className={styles.metaRow}>
        <span className={styles.label}>Date</span>
        <span className={styles.value}>{fmtDateTime(data.delivery_date)}</span>
      </div>

      <hr className={styles.rule} />

      <div className={styles.unitBlock}>
        <div className={styles.label}>Container</div>
        <div className={styles.unitNumber}>{formatUnitNumber(data.container.unit_number)}</div>
        <div className={styles.unitSpec}>
          {[data.container.size, data.container.damage]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>

      {data.container.release_number_value && (
        <div className={styles.metaRow}>
          <span className={styles.label}>Release</span>
          <span className={styles.value}>
            {data.container.release_number_value}
          </span>
        </div>
      )}

      <hr className={styles.rule} />

      <div className={styles.block}>
        <div className={styles.label}>Deliver to</div>
        <div className={styles.value}>{deliverToName}</div>
        <div className={styles.valueSm}>{deliverToStreet}</div>
        {deliverToLocality && (
          <div className={styles.valueSm}>{deliverToLocality}</div>
        )}
      </div>

      {(driverName || carrier || data.door_orientation) && (
        <>
          <hr className={styles.rule} />
          {driverName && (
            <div className={styles.metaRow}>
              <span className={styles.label}>Driver</span>
              <span className={styles.value}>{driverName}</span>
            </div>
          )}
          {carrier && (
            <div className={styles.metaRow}>
              <span className={styles.label}>Carrier</span>
              <span className={styles.value}>{carrier}</span>
            </div>
          )}
          {data.door_orientation && (
            <div className={styles.metaRow}>
              <span className={styles.label}>Doors</span>
              <span className={styles.value}>{data.door_orientation}</span>
            </div>
          )}
        </>
      )}

      {data.payment_details && (
        <>
          <hr className={styles.rule} />
          <div className={styles.block}>
            <div className={styles.label}>Payment</div>
            <div className={styles.value}>{data.payment_details}</div>
          </div>
        </>
      )}

      {data.receipt_note && (
        <>
          <hr className={styles.rule} />
          <div className={styles.note}>{data.receipt_note}</div>
        </>
      )}

      <hr className={styles.rule} />

      <div className={styles.sigBlock}>
        <div className={styles.sigLine}></div>
        <div className={styles.label}>Driver signature</div>
      </div>

      <div className={styles.footer}>
        Received in good order. Thank you.
      </div>
    </div>
  );
}
