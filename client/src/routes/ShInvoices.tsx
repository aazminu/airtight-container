import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '../components/ui';
import { fmtCurrency, fmtDate } from '../components/templates/invoice/format';
import styles from './ShInvoices.module.css';

interface ShInvoiceRow {
  id: number;
  client_id: number;
  billing_month: string;
  invoice_number: number;
  subtotal: string;
  total: string;
  status: 'pending_review' | 'sent' | 'paid';
  generated_at: string | null;
  sent_at: string | null;
  pdf_s3_key: string | null;
  client_name: string;
  business_name: string | null;
  contact_email: string | null;
  lines: unknown[];
}

interface ListResponse {
  status: string;
  data: { invoices: ShInvoiceRow[] };
}

const TABS: Array<{ key: string; label: string }> = [
  { key: 'pending_review', label: 'Pending review' },
  { key: 'sent', label: 'Sent' },
  { key: 'paid', label: 'Paid' },
  { key: 'all', label: 'All' },
];

const statusTone = (s: ShInvoiceRow['status']) =>
  s === 'paid' ? 'success' : s === 'sent' ? 'info' : 'warning';

export default function ShInvoices() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const activeTab = params.get('status') ?? 'pending_review';
  const [invoices, setInvoices] = useState<ShInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = activeTab === 'all' ? '' : `?status=${activeTab}`;
      const res = await fetch(`/api/v2/sh-invoice${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as ListResponse;
      setInvoices(body.data.invoices ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    load();
  }, [load]);

  const customerLabel = (inv: ShInvoiceRow) =>
    inv.business_name || inv.client_name || 'Unknown';

  const sorted = useMemo(() => {
    return invoices.slice().sort((a, b) => {
      if (a.billing_month !== b.billing_month)
        return a.billing_month < b.billing_month ? 1 : -1;
      return b.invoice_number - a.invoice_number;
    });
  }, [invoices]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>S&amp;H Invoices</h1>
          <p className={styles.subtitle}>
            {loading ? 'Loading…' : `${sorted.length} invoice${sorted.length === 1 ? '' : 's'}`}
          </p>
        </div>
      </header>

      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className={`${styles.tab} ${t.key === activeTab ? styles.active : ''}`}
            onClick={() => {
              const next = new URLSearchParams(params);
              if (t.key === 'pending_review') next.delete('status');
              else next.set('status', t.key);
              setParams(next, { replace: true });
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className={styles.empty}>Failed to load: {error}</div>}

      <div className={styles.list}>
        {sorted.map((inv) => (
          <button
            key={inv.id}
            type="button"
            className={styles.row}
            onClick={() => navigate(`/sh-invoices/${inv.id}`)}
          >
            <span className={styles.rowMonth}>
              {fmtDate(inv.billing_month, { month: 'long', year: 'numeric' })}
            </span>
            <span className={styles.rowClient}>{customerLabel(inv)}</span>
            <span className={styles.rowNumber}>#{inv.invoice_number}</span>
            <span className={styles.rowTotal}>{fmtCurrency(inv.total)}</span>
            <Badge tone={statusTone(inv.status)}>
              {inv.status === 'pending_review'
                ? 'Pending'
                : inv.status === 'sent'
                  ? 'Sent'
                  : 'Paid'}
            </Badge>
          </button>
        ))}
        {!loading && sorted.length === 0 && (
          <div className={styles.empty}>No S&amp;H invoices in this view.</div>
        )}
      </div>
    </div>
  );
}
