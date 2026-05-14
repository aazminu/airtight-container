import { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, useConfirm } from '../components/ui';
import { fmtCurrency, fmtDate } from '../components/templates/invoice/format';
import { userContext } from '../context/restaurantcontext';
import styles from './ShInvoiceDetail.module.css';

interface ShInvoiceLine {
  id: number;
  sh_box_id: number;
  line_type: 'in_fee' | 'out_fee' | 'storage_days';
  days_count: number | null;
  rate: string;
  amount: string;
  description: string;
}

interface ShInvoice {
  id: number;
  client_id: number;
  billing_month: string;
  invoice_number: number;
  subtotal: string;
  tax_rate: string | null;
  tax_amount: string | null;
  total: string;
  pdf_s3_key: string | null;
  status: 'pending_review' | 'sent' | 'paid';
  generated_at: string | null;
  sent_at: string | null;
  client_name: string;
  business_name: string | null;
  contact_email: string | null;
  lines: ShInvoiceLine[];
}

type ActionState =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'ok'; message: string }
  | { kind: 'err'; message: string };

const statusTone = (s: ShInvoice['status']) =>
  s === 'paid' ? 'success' : s === 'sent' ? 'info' : 'warning';

export default function ShInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useContext(userContext) as { user?: { permissions?: string } };
  const isAdmin = user?.permissions === 'admin';
  const confirm = useConfirm();
  const [invoice, setInvoice] = useState<ShInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/sh-invoice/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data: { invoice: ShInvoice } };
      setInvoice(body.data.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSend = async () => {
    if (!invoice) return;
    const ok = await confirm({
      title: 'Mark as sent?',
      message: `Invoice #${invoice.invoice_number} will be flagged as delivered to the customer.`,
      confirmLabel: 'Mark sent',
    });
    if (!ok) return;
    setAction({ kind: 'busy', label: 'Sending…' });
    try {
      const res = await fetch(`/api/v2/sh-invoice/${invoice.id}/send`, {
        method: 'PUT',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAction({ kind: 'ok', message: 'Marked as sent.' });
      await load();
    } catch (e) {
      setAction({
        kind: 'err',
        message: e instanceof Error ? e.message : 'Send failed',
      });
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading…</div>
      </div>
    );
  }
  if (error || !invoice) {
    return (
      <div className={styles.page}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('/sh-invoices')}
        >
          ← S&amp;H invoices
        </button>
        <div className={styles.error}>{error ?? 'Not found'}</div>
      </div>
    );
  }

  const customer = invoice.business_name || invoice.client_name;

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <button
            type="button"
            className={styles.back}
            onClick={() => navigate('/sh-invoices')}
          >
            ← S&amp;H invoices
          </button>
          <h1 className={styles.title}>
            #{invoice.invoice_number} ·{' '}
            {fmtDate(invoice.billing_month, { month: 'long', year: 'numeric' })} ·{' '}
            {customer}
          </h1>
          <Badge tone={statusTone(invoice.status)}>
            {invoice.status === 'pending_review'
              ? 'Pending review'
              : invoice.status === 'sent'
                ? 'Sent'
                : 'Paid'}
          </Badge>
        </div>
        {isAdmin && invoice.status === 'pending_review' && (
          <div className={styles.actions}>
            <Button onClick={handleSend}>Send</Button>
          </div>
        )}
      </div>

      {action.kind === 'busy' && (
        <div className={styles.success}>{action.label}</div>
      )}
      {action.kind === 'ok' && (
        <div className={styles.success}>{action.message}</div>
      )}
      {action.kind === 'err' && (
        <div className={styles.error}>{action.message}</div>
      )}

      <div className={styles.sheet}>
        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Customer</span>
            <span className={styles.metaValue}>{customer}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Billing month</span>
            <span className={styles.metaValue}>
              {fmtDate(invoice.billing_month, { month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Generated</span>
            <span className={styles.metaValue}>
              {invoice.generated_at ? fmtDate(invoice.generated_at) : '—'}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Sent</span>
            <span className={styles.metaValue}>
              {invoice.sent_at ? fmtDate(invoice.sent_at) : '—'}
            </span>
          </div>
        </div>

        <table className={styles.lineTable}>
          <thead>
            <tr>
              <th>Description</th>
              <th>Days</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td>{l.days_count ?? ''}</td>
                <td>{fmtCurrency(l.rate)}</td>
                <td>{fmtCurrency(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span>Subtotal</span>
            <span>{fmtCurrency(invoice.subtotal)}</span>
          </div>
          {invoice.tax_amount && (
            <div className={styles.totalRow}>
              <span>Tax</span>
              <span>{fmtCurrency(invoice.tax_amount)}</span>
            </div>
          )}
          <div className={`${styles.totalRow} ${styles.grandTotal}`}>
            <span>Total</span>
            <span>{fmtCurrency(invoice.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
