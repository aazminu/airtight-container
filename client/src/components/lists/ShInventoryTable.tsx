import { useEffect, useMemo, useState } from 'react';
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
  /** Which S&H lifecycle state to show. Pending S&H boxes live on /audit
   *  and are never surfaced here. */
  state: 'in_storage' | 'checked_out';
  search: string;
  isAdmin: boolean;
  onMessage: (msg: string) => void;
}

const STATE_LABELS: Record<ShState, string> = {
  pending: 'Pending audit',
  in_storage: 'In storage',
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

const isoToLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

// The Inventory page's S&H tabs — admin-facing desktop view, split by
// lifecycle state to mirror sales (Available/Sold). The yard-facing
// checkout flow on YardView is mobile-first; this one is desktop with
// more context (release link, billing mode, rates). Inline check-out
// mirrors YardView's UX so an admin sitting at the desk can flip a box
// outbound without bouncing to the mobile page.
export function ShInventoryTable({ state, search, isAdmin, onMessage }: Props) {
  const [rows, setRows] = useState<ShInventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshSeq, setRefreshSeq] = useState(0);

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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  }, [state, refreshSeq]);

  const sorted = useMemo(() => {
    const q = search.trim();
    // In-yard view: newest arrivals first.
    // Checked-out view: most-recently-out first.
    const sortKey = (r: ShInventoryRow) =>
      state === 'checked_out' ? r.checkout_date ?? r.intake_date : r.intake_date;
    return rows
      .filter((r) => matchesSearch(r, q))
      .slice()
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  }, [rows, search, state]);

  if (error) {
    return <div className={styles.error}>Failed to load S&amp;H inventory: {error}</div>;
  }

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
            <th>Checkout</th>
            {isAdmin && <th />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <ShRow
              key={r.id}
              row={r}
              isAdmin={isAdmin}
              onCheckedOut={() => {
                onMessage('Box checked out.');
                setRefreshSeq((s) => s + 1);
              }}
            />
          ))}
          {!loading && sorted.length === 0 && (
            <tr>
              <td colSpan={isAdmin ? 11 : 10} className={styles.empty}>
                {search
                  ? 'No S&H boxes match the current search.'
                  : state === 'in_storage'
                    ? 'No S&H boxes currently in the yard.'
                    : 'No S&H boxes have been checked out yet.'}
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
  isAdmin,
  onCheckedOut,
}: {
  row: ShInventoryRow;
  isAdmin: boolean;
  onCheckedOut: () => void;
}) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutDate, setCheckoutDate] = useState(() => isoToLocalInput(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customerLabel = (() => {
    if (row.client_id == null) return 'Unassigned';
    if (row.business_name && row.client_name) {
      return `${row.client_name} — ${row.business_name}`;
    }
    return row.client_name ?? `Client #${row.client_id}`;
  })();

  const confirmCheckout = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const iso = new Date(checkoutDate).toISOString();
      const res = await fetch(`/api/v2/sh-inventory/checkout/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ checkout_date: iso }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCheckoutOpen(false);
      onCheckedOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check-out failed');
    } finally {
      setSubmitting(false);
    }
  };

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
      <td className={row.checkout_date ? '' : styles.muted}>{fmtDate(row.checkout_date)}</td>
      {isAdmin && (
        <td>
          {row.state === 'in_storage' && !checkoutOpen && (
            <Button variant="ghost" onClick={() => setCheckoutOpen(true)}>
              Check out
            </Button>
          )}
          {checkoutOpen && (
            <div className={styles.inlineCheckout}>
              <input
                type="datetime-local"
                value={checkoutDate}
                onChange={(e) => setCheckoutDate(e.target.value)}
              />
              <Button
                variant="primary"
                onClick={confirmCheckout}
                disabled={submitting}
              >
                {submitting ? '…' : 'Confirm'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setCheckoutOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              {error && <div className={styles.error}>{error}</div>}
            </div>
          )}
        </td>
      )}
    </tr>
  );
}
