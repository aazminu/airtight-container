import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QuoteTemplate from '../components/templates/quote/QuoteTemplate';
import type { QuoteData } from '../components/templates/quote/types';
import { Badge, Button, Modal, useConfirm, usePrompt } from '../components/ui';
import { fmtDate } from '../components/templates/quote/format';
import { userContext } from '../context/userContext';
import QuoteEditor from '../components/forms/QuoteEditor';
import styles from './QuoteDetail.module.css';

interface ApiResponse {
  status: string;
  results: number;
  data: { quotes: QuoteData[] };
}

interface InventoryRow {
  id: number;
  unit_number: string;
  size: string;
  damage: string;
  state: string;
}

type ActionState =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'ok'; message: string }
  | { kind: 'err'; message: string };

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useContext(userContext) as { user?: { permissions?: string } };
  const isAdmin = user?.permissions === 'admin';
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [available, setAvailable] = useState<InventoryRow[]>([]);
  const [availableLoaded, setAvailableLoaded] = useState(false);
  const [containerSearch, setContainerSearch] = useState('');
  // Selection order is significant: chosen container[i] maps to quote
  // line[i] positionally on promotion (see promote endpoint).
  const [promoteIds, setPromoteIds] = useState<number[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/quote/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as ApiResponse;
      const q = body.data.quotes[0];
      if (!q) throw new Error('Quote not found');
      setQuote(q);
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
    if (!quote) return '';
    return quote.customer.business_name || quote.customer.client_name || 'Unknown';
  }, [quote]);

  const handleRegeneratePdf = async () => {
    if (!quote) return;
    setAction({ kind: 'busy', label: 'Regenerating PDF…' });
    try {
      const res = await fetch(`/api/v2/quote/${quote.id}/pdf`, {
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
    if (!quote) return;
    const fallbackTo = quote.customer.contact_email ?? '';
    const to = await prompt({
      title: 'Email quote',
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
      const res = await fetch(`/api/v2/quote/${quote.id}/email`, {
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

  const handleDelete = async () => {
    if (!quote) return;
    const ok = await confirm({
      title: 'Delete quote?',
      message: `Quote ${quote.quote_number} will be marked deleted. The quote number stays in the month's sequence (it won't be reused). This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setAction({ kind: 'busy', label: 'Deleting…' });
    try {
      const res = await fetch(`/api/v2/quote/${quote.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      navigate('/quotes');
    } catch (e) {
      setAction({
        kind: 'err',
        message: e instanceof Error ? e.message : 'Delete failed',
      });
    }
  };

  const handleSave = async (updated: QuoteData) => {
    setAction({ kind: 'busy', label: 'Saving…' });
    try {
      const res = await fetch(`/api/v2/quote/${updated.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: updated.customer.id,
          quote_taxed: updated.quote_taxed,
          quote_credit: updated.quote_credit,
          tax_rate: updated.tax_rate,
          cc_fee_rate: updated.cc_fee_rate,
          notes: updated.notes,
          lines: updated.lines
            .filter((l) => l.description.trim() !== '')
            .map((l, i) => ({
              description: l.description,
              sale_price: l.sale_price,
              trucking_rate: l.trucking_rate,
              destination: l.destination,
              position: i,
              modifications: l.modifications
                .filter((m) => m.description.trim() !== '')
                .map((m, j) => ({
                  description: m.description,
                  price: m.price,
                  position: j,
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

  const openPromote = async () => {
    setPromoteIds([]);
    setContainerSearch('');
    setPromoteOpen(true);
    if (availableLoaded) return;
    try {
      const res = await fetch('/api/v1/inventory/state', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'available' }),
      });
      if (res.ok) {
        const body = await res.json();
        setAvailable(body.data.inventory ?? []);
        setAvailableLoaded(true);
      }
    } catch {
      // Non-fatal; the picker shows empty.
    }
  };

  const togglePromote = (containerId: number) => {
    setPromoteIds((prev) =>
      prev.includes(containerId)
        ? prev.filter((x) => x !== containerId)
        : [...prev, containerId],
    );
  };

  const handlePromote = async () => {
    if (!quote || promoteIds.length === 0) return;
    setAction({ kind: 'busy', label: 'Creating invoice…' });
    setPromoteOpen(false);
    try {
      const res = await fetch(`/api/v2/quote/${quote.id}/promote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          containers: promoteIds.map((inventory_id) => ({ inventory_id })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      const created = (await res.json()) as {
        id: number;
        invoice_number: number;
      };
      setAction({
        kind: 'ok',
        message: `Invoice #${created.invoice_number} created.`,
      });
      navigate(`/invoices/${created.id}`);
    } catch (e) {
      setAction({
        kind: 'err',
        message: e instanceof Error ? e.message : 'Promote failed',
      });
    }
  };

  const filteredAvailable = useMemo(() => {
    if (!containerSearch.trim()) return available;
    const q = containerSearch.toLowerCase();
    return available.filter((r) =>
      [r.unit_number, r.size, r.damage].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [available, containerSearch]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading quote…</div>
      </div>
    );
  }
  if (error || !quote) {
    return (
      <div className={styles.page}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('/quotes')}
        >
          ← Back to quotes
        </button>
        <div className={styles.error}>{error ?? 'Quote not found'}</div>
      </div>
    );
  }

  const isDeleted = quote.deleted_at != null;

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <button
            type="button"
            className={styles.back}
            onClick={() => navigate('/quotes')}
          >
            ← Quotes
          </button>
          <h1 className={styles.title}>
            {quote.quote_number} · {customerLabel} ·{' '}
            {fmtDate(quote.created_at, {
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
              <Button variant="secondary" onClick={openPromote}>
                Promote to invoice
              </Button>
            )}
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
            <Badge tone={quote.status === 'sent' ? 'info' : 'warning'}>
              {quote.status === 'sent' ? 'Sent' : 'Draft'}
            </Badge>
            {quote.sent_at && (
              <span className={styles.statusAudit}>
                Sent{' '}
                {fmtDate(quote.sent_at, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
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

      {isDeleted ? (
        <div className={styles.tombstone}>
          <h2>Quote deleted</h2>
          <p>
            Quote {quote.quote_number} was deleted on{' '}
            {fmtDate(quote.deleted_at, {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
            . The quote number is preserved so the month's sequence stays
            contiguous.
          </p>
        </div>
      ) : editing ? (
        <QuoteEditor
          initial={quote}
          onCancel={() => setEditing(false)}
          onSave={handleSave}
        />
      ) : (
        <div className={styles.sheetWrap}>
          <QuoteTemplate data={quote} />
        </div>
      )}

      <Modal
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        title="Promote to invoice"
        size="lg"
      >
        <p className={styles.promoteHint}>
          Pick the containers for the new invoice. The quote's line pricing
          (sale price, trucking, modifications) is copied onto them in order —
          the 1st container selected takes the 1st quote line, and so on. The
          quote stays as-is and can be promoted again.
        </p>
        <input
          type="search"
          className={styles.promoteSearch}
          value={containerSearch}
          onChange={(e) => setContainerSearch(e.target.value)}
          placeholder="Search unit #, size, condition…"
        />
        <div className={styles.promoteList}>
          {filteredAvailable.length === 0 && (
            <div className={styles.empty}>
              {availableLoaded
                ? 'No available containers match the search.'
                : 'Loading available containers…'}
            </div>
          )}
          {filteredAvailable.map((row) => {
            const order = promoteIds.indexOf(row.id);
            const checked = order !== -1;
            const mappedLine = checked ? quote.lines[order] : undefined;
            return (
              <button
                key={row.id}
                type="button"
                className={`${styles.promoteRow} ${
                  checked ? styles.promoteRowChecked : ''
                }`}
                onClick={() => togglePromote(row.id)}
              >
                <input type="checkbox" checked={checked} readOnly tabIndex={-1} />
                <span className={styles.promoteRowName}>{row.unit_number}</span>
                <span className={styles.promoteRowMeta}>
                  {row.size} · {row.damage}
                </span>
                {checked && (
                  <span className={styles.promoteRowMap}>
                    → line {order + 1}
                    {mappedLine?.description
                      ? `: ${mappedLine.description}`
                      : ' (no quote line — blank pricing)'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className={styles.promoteFooter}>
          <span className={styles.promoteRowMeta}>
            {promoteIds.length} container{promoteIds.length === 1 ? '' : 's'}{' '}
            selected · {quote.lines.length} quote line
            {quote.lines.length === 1 ? '' : 's'}
          </span>
          <div className={styles.promoteFooterActions}>
            <Button variant="secondary" onClick={() => setPromoteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePromote} disabled={promoteIds.length === 0}>
              Create invoice
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
