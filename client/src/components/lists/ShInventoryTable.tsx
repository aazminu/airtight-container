import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button } from '../ui';
import { formatUnitNumber } from '../../lib/unitNumber';
import styles from '../../routes/Inventory.module.css';

type ShState = 'pending' | 'in_storage' | 'checked_out';
type ShBillingMode = 'in_out_daily' | 'flat_monthly' | 'non_billable';

interface ShInventoryRow {
  id: number;
  client_id: number | null;
  client_name: string | null;
  business_name: string | null;
  release_number_id: number | null;
  release_number_value: string | null;
  sale_company_name: string | null;
  unit_number: string;
  size: string;
  damage: string | null;
  state: ShState;
  is_pending_audit: boolean;
  billing_mode: ShBillingMode;
  in_fee: string | null;
  out_fee: string | null;
  daily_rate: string | null;
  flat_rate: string | null;
  intake_date: string;
  checkout_date: string | null;
  notes: string | null;
}

interface Props {
  /** Which Storage & Handling lifecycle state to show. Pending boxes
   *  live on /audit and are never surfaced here. */
  state: 'in_storage' | 'checked_out';
  search: string;
}

const STATE_LABELS: Record<ShState, string> = {
  pending: 'Pending audit',
  in_storage: 'On site',
  checked_out: 'Checked out',
};

const BILLING_LABELS: Record<ShBillingMode, string> = {
  in_out_daily: 'In/Out + daily',
  flat_monthly: 'Flat monthly',
  non_billable: 'Non-billable',
};

const fmtDate = (iso: string | null): string => (iso ? iso.slice(0, 10) : '—');

const MS_PER_DAY = 86_400_000;
const daysOnsite = (intake: string, checkout: string | null): number => {
  const start = new Date(intake);
  const end = checkout ? new Date(checkout) : new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);
};

const rateLabel = (row: ShInventoryRow): string => {
  if (row.billing_mode === 'flat_monthly') {
    return row.flat_rate ? `$${row.flat_rate}/mo` : '—';
  }
  if (row.billing_mode === 'non_billable') return '—';
  if (row.in_fee && row.out_fee && row.daily_rate) {
    return `$${row.in_fee} / $${row.out_fee} / $${row.daily_rate}d`;
  }
  return '—';
};

const matchesSearch = (row: ShInventoryRow, q: string): boolean => {
  if (!q) return true;
  const needle = q.toLowerCase();
  const haystack = [
    row.unit_number,
    row.size,
    row.client_name,
    row.business_name,
    row.release_number_value,
    row.sale_company_name,
    row.damage,
    row.notes,
  ];
  return haystack.some((h) => h && h.toLowerCase().includes(needle));
};

// Storage & Handling tables on the Inventory page. Pending boxes live
// on /audit; this surface splits between On Site (in_storage) and
// Checked Out (checked_out). Outbound is its own page now — operators
// click the Outbound link on an on-site row to deep-link into the
// Storage & Handling outbound flow with the box pre-selected.
export function ShInventoryTable({ state, search }: Props) {
  const [rows, setRows] = useState<ShInventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/v2/sh-inventory?state=${encodeURIComponent(state)}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error(`Something went wrong`);
        const body = (await res.json()) as { data: { boxes: ShInventoryRow[] } };
        if (cancelled) return;
        setRows(body.data.boxes);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  const sorted = useMemo(() => {
    const q = search.trim();
    const sortKey = (r: ShInventoryRow) =>
      state === 'checked_out' ? r.checkout_date ?? r.intake_date : r.intake_date;
    return rows
      .filter((r) => matchesSearch(r, q))
      .slice()
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  }, [rows, search, state]);

  if (error) {
    return (
      <div className={styles.error}>
        Failed to load Storage &amp; Handling inventory: {error}
      </div>
    );
  }

  // On Site rows can't have a checkout date by definition — drop that
  // column entirely on the On Site sub-tab so the table reads cleanly.
  const showCheckout = state === 'checked_out';
  const cols = showCheckout ? 11 : 10;

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Unit #</th>
            <th>Customer</th>
            <th>Size</th>
            <th>State</th>
            <th>Billing</th>
            <th>Rates</th>
            <th>Release #</th>
            <th>Intake</th>
            <th>Days</th>
            {showCheckout && <th>Checkout</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <ShRow key={r.id} row={r} showCheckout={showCheckout} />
          ))}
          {!loading && sorted.length === 0 && (
            <tr>
              <td colSpan={cols} className={styles.empty}>
                {search
                  ? 'No Storage & Handling boxes match the current search.'
                  : state === 'in_storage'
                    ? 'No Storage & Handling boxes currently on site.'
                    : 'No Storage & Handling boxes have been checked out yet.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ShRow({
  row,
  showCheckout,
}: {
  row: ShInventoryRow;
  showCheckout: boolean;
}) {
  const customerLabel = (() => {
    if (row.client_id == null) return 'Unassigned';
    if (row.business_name && row.client_name) {
      return `${row.client_name} — ${row.business_name}`;
    }
    return row.client_name ?? `Client #${row.client_id}`;
  })();

  return (
    <tr>
      <td>
        <span className={styles.unitCell}>
          {formatUnitNumber(row.unit_number)}
          {row.state === 'checked_out' && <Badge tone="info">Out</Badge>}
        </span>
      </td>
      <td className={row.client_id ? '' : styles.muted}>{customerLabel}</td>
      <td>{row.size}</td>
      <td>{STATE_LABELS[row.state]}</td>
      <td>{BILLING_LABELS[row.billing_mode]}</td>
      <td>{rateLabel(row)}</td>
      <td className={row.release_number_value ? '' : styles.muted}>
        {row.release_number_value ?? '—'}
      </td>
      <td>{fmtDate(row.intake_date)}</td>
      <td>{daysOnsite(row.intake_date, row.checkout_date)}</td>
      {showCheckout && (
        <td className={row.checkout_date ? '' : styles.muted}>
          {fmtDate(row.checkout_date)}
        </td>
      )}
      <td>
        {row.state === 'in_storage' ? (
          <Link
            to={`/outbound?sh_inventory_id=${row.id}`}
            className={styles.outboundLink}
          >
            <Button variant="ghost">Outbound</Button>
          </Link>
        ) : row.state === 'checked_out' ? (
          <a
            href={`/sh-pickup-receipt/${row.id}`}
            target="_blank"
            rel="noreferrer"
            className={styles.outboundLink}
          >
            <Button variant="ghost">Reprint</Button>
          </a>
        ) : (
          <span className={styles.muted}>—</span>
        )}
      </td>
    </tr>
  );
}
