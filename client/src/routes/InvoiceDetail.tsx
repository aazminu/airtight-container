import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import InvoiceTemplate from '../components/templates/invoice/InvoiceTemplate';
import type {
  InvoiceData,
  InvoiceStatus,
} from '../components/templates/invoice/types';
import { INVOICE_STATUSES } from '../components/templates/invoice/types';
import { Badge, Button, useConfirm, usePrompt } from '../components/ui';
import {
  statusBadgeTone,
  statusLabel,
  isAwaitingPastDue,
  AWAITING_OVERDUE_DAYS,
  daysSince,
} from '../components/lists/invoiceStatus';
import { fmtDate } from '../components/templates/invoice/format';
import { userContext } from '../context/userContext';
import InvoiceEditor from '../components/forms/InvoiceEditor';
import styles from './InvoiceDetail.module.css';

interface ApiResponse {
  status: string;
  results: number;
  data: { invoices: InvoiceData[] };
}

type ActionState =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'ok'; message: string }
  | { kind: 'err'; message: string };

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useContext(userContext) as { user?: { permissions?: string } };
  const isAdmin = user?.permissions === 'admin';
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/invoice/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as ApiResponse;
      const inv = body.data.invoices[0];
      if (!inv) throw new Error('Invoice not found');
      setInvoice(inv);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const customerLabel = useMemo(() => {
    if (!invoice) return '';
    return invoice.customer.business_name || invoice.customer.client_name || 'Unknown';
  }, [invoice]);

  const handleRegeneratePdf = async () => {
    if (!invoice) return;
    setAction({ kind: 'busy', label: 'Regenerating PDF…' });
    try {
      const res = await fetch(`/api/v2/invoice/${invoice.invoice_id}/pdf`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      setAction({ kind: 'ok', message: 'PDF regenerated.' });
      await load();
    } catch (e) {
      setAction({
        kind: 'err',
        message: e instanceof Error ? e.message : 'PDF regenerate failed',
      });
    }
  };

  const handleEmail = async () => {
    if (!invoice) return;
    const fallbackTo = invoice.customer.contact_email ?? '';
    const to = await prompt({
      title: 'Email invoice',
      label: 'Recipient',
      defaultValue: fallbackTo,
      placeholder: 'name@example.com',
      confirmLabel: 'Send',
      validate: (v) => {
        const t = v.trim();
        if (!t) return 'Recipient email is required.';
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t))
          return 'Not a valid email address.';
        return null;
      },
    });
    if (to === null) return;
    setAction({ kind: 'busy', label: 'Sending…' });
    try {
      const res = await fetch(`/api/v2/invoice/${invoice.invoice_id}/email`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      setAction({ kind: 'ok', message: `Sent to ${to}.` });
      await load();
    } catch (e) {
      setAction({
        kind: 'err',
        message: e instanceof Error ? e.message : 'Email failed',
      });
    }
  };

  const handleStatusChange = async (next: InvoiceStatus) => {
    if (!invoice) return;
    if (next === invoice.status) return;
    if (next === 'cancelled') {
      const ok = await confirm({
        title: 'Cancel invoice?',
        message: `Invoice #${invoice.invoice_number} will be marked cancelled. It stays in the record (use Delete for true tombstone). You can re-open it later by flipping the status back.`,
        confirmLabel: 'Cancel invoice',
        cancelLabel: 'Keep current status',
        danger: true,
      });
      if (!ok) return;
    }
    setAction({ kind: 'busy', label: 'Updating status…' });
    try {
      const res = await fetch(
        `/api/v2/invoice/${invoice.invoice_id}/status`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setAction({ kind: 'ok', message: `Status set to ${statusLabel(next)}.` });
      await load();
    } catch (e) {
      setAction({
        kind: 'err',
        message: e instanceof Error ? e.message : 'Status update failed',
      });
    }
  };

  const handleDelete = async () => {
    if (!invoice) return;
    const ok = await confirm({
      title: 'Delete invoice?',
      message: `Invoice #${invoice.invoice_number}: containers will return to "available" and the invoice will be marked deleted. The invoice number stays in the month's sequence (it won't be reused). This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setAction({ kind: 'busy', label: 'Deleting…' });
    try {
      const res = await fetch(`/api/v2/invoice/${invoice.invoice_id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      navigate('/invoices');
    } catch (e) {
      setAction({
        kind: 'err',
        message: e instanceof Error ? e.message : 'Delete failed',
      });
    }
  };

  const handleSave = async (updated: InvoiceData) => {
    setAction({ kind: 'busy', label: 'Saving…' });
    try {
      const res = await fetch(`/api/v2/invoice/${updated.invoice_id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: updated.customer.id,
          invoice_taxed: updated.invoice_taxed,
          invoice_credit: updated.invoice_credit,
          invoice_date: updated.invoice_date,
          tax_rate: updated.tax_rate,
          cc_fee_rate: updated.cc_fee_rate,
          containers: updated.containers.map((c) => ({
            inventory_id: c.inventory_id,
            sale_price: c.sale_price,
            trucking_rate: c.trucking_rate,
            modification_price: c.modification_price,
            destination: c.destination,
            invoice_notes: c.invoice_notes,
            outbound_date: c.outbound_date,
            modifications: c.modifications.map((m, i) => ({
              description: m.description,
              price: m.price,
              position: i,
            })),
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      setAction({ kind: 'ok', message: 'Saved.' });
      setEditing(false);
      await load();
    } catch (e) {
      setAction({
        kind: 'err',
        message: e instanceof Error ? e.message : 'Save failed',
      });
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading invoice…</div>
      </div>
    );
  }
  if (error || !invoice) {
    return (
      <div className={styles.page}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('/invoices')}
        >
          ← Back to invoices
        </button>
        <div className={styles.error}>{error ?? 'Invoice not found'}</div>
      </div>
    );
  }

  const isDeleted = invoice.deleted_at != null;

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <button
            type="button"
            className={styles.back}
            onClick={() => navigate('/invoices')}
          >
            ← Invoices
          </button>
          <h1 className={styles.title}>
            #{invoice.invoice_number} · {customerLabel} ·{' '}
            {fmtDate(invoice.invoice_date, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </h1>
        </div>
        {!editing && !isDeleted && (
          <div className={styles.actions}>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {isAdmin && (
              <Button variant="secondary" onClick={handleRegeneratePdf}>
                Regenerate PDF
              </Button>
            )}
            {isAdmin && <Button onClick={handleEmail}>Email</Button>}
            {isAdmin && (
              <Button variant="danger" onClick={handleDelete}>
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      {!isDeleted && (
        <div className={styles.statusBar}>
          <div className={styles.statusLeft}>
            <Badge tone={statusBadgeTone(invoice.status)}>
              {statusLabel(invoice.status)}
            </Badge>
            {isAwaitingPastDue(invoice.status, invoice.invoice_date) && (
              <span className={styles.statusPastDue}>
                {daysSince(invoice.invoice_date)} days unpaid · past the{' '}
                {AWAITING_OVERDUE_DAYS}-day mark
              </span>
            )}
            {invoice.status_changed_at && (
              <span className={styles.statusAudit}>
                Last changed{' '}
                {fmtDate(invoice.status_changed_at, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {invoice.status_changed_by_user_id
                  ? ` by ${invoice.status_changed_by_user_id}`
                  : ''}
              </span>
            )}
          </div>
          {isAdmin && (
            <label className={styles.statusControl}>
              <span className={styles.statusControlLabel}>Change to:</span>
              <select
                className={styles.statusSelect}
                value={invoice.status}
                onChange={(e) =>
                  handleStatusChange(e.target.value as InvoiceStatus)
                }
                disabled={action.kind === 'busy'}
              >
                {INVOICE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {action.kind === 'busy' && (
        <div className={styles.success}>{action.label}</div>
      )}
      {action.kind === 'ok' && (
        <div className={styles.success}>{action.message}</div>
      )}
      {action.kind === 'err' && (
        <div className={styles.error}>{action.message}</div>
      )}

      {!isDeleted && !editing && invoice.containers.length > 0 && (
        <div className={styles.deliveries}>
          <div className={styles.deliveriesHead}>Delivery sheets</div>
          <p className={styles.deliveriesHint}>
            Create a driver delivery sheet for a container on this invoice. The
            box, customer, and shipping address pre-fill from the sale.
          </p>
          <div className={styles.deliveriesList}>
            {invoice.containers.map((c) => (
              <div key={c.inventory_id} className={styles.deliveryRow}>
                <span className={styles.deliveryUnit}>
                  {c.unit_number.trim()}
                </span>
                <span className={styles.deliveryMeta}>
                  {c.size} · {c.damage || '—'}
                </span>
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate(
                      `/reports/new/delivery_sheet?container_id=${c.inventory_id}&invoice_id=${invoice.invoice_id}`,
                    )
                  }
                >
                  Make delivery sheet
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isDeleted ? (
        <div className={styles.tombstone}>
          <h2>Invoice deleted</h2>
          <p>
            Invoice #{invoice.invoice_number} was deleted on{' '}
            {fmtDate(invoice.deleted_at, {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
            . Its containers were returned to inventory. The invoice number
            is preserved so the month's sequence stays contiguous.
          </p>
        </div>
      ) : editing ? (
        <InvoiceEditor
          initial={invoice}
          onCancel={() => setEditing(false)}
          onSave={handleSave}
        />
      ) : (
        <div className={styles.sheetWrap}>
          <InvoiceTemplate data={invoice} />
        </div>
      )}
    </div>
  );
}
