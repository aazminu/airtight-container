import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QuoteTemplate from '../components/templates/quote/QuoteTemplate';
import type { QuoteData } from '../components/templates/quote/types';
import {
  AddressFields,
  Badge,
  Button,
  Modal,
  useConfirm,
  usePrompt,
} from '../components/ui';
import { DoorOrientationField } from '../components/forms/DoorOrientationField';
import { fmtCurrency, fmtDate } from '../components/templates/quote/format';
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

interface TruckingCompany {
  id: number;
  company_name: string;
}

interface ContainerDelivery {
  outbound_trucking_company_id: number | null;
  door_orientation: string;
  delivery_same_as_ship: boolean;
  delivery_name: string;
  delivery_street: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
}

const EMPTY_DELIVERY: ContainerDelivery = {
  outbound_trucking_company_id: null,
  door_orientation: '',
  delivery_same_as_ship: true,
  delivery_name: '',
  delivery_street: '',
  delivery_city: '',
  delivery_state: '',
  delivery_zip: '',
};

interface ShipTo {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

const EMPTY_SHIP_TO: ShipTo = {
  name: '',
  street: '',
  city: '',
  state: '',
  zip: '',
};

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
  const [truckingCompanies, setTruckingCompanies] = useState<TruckingCompany[]>(
    [],
  );
  const [shipSameAsBilling, setShipSameAsBilling] = useState(true);
  const [shipTo, setShipTo] = useState<ShipTo>(EMPTY_SHIP_TO);
  const [deliveryByContainer, setDeliveryByContainer] = useState<
    Record<number, ContainerDelivery>
  >({});

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
    setShipSameAsBilling(true);
    setShipTo(EMPTY_SHIP_TO);
    setDeliveryByContainer({});
    setPromoteOpen(true);
    if (!availableLoaded) {
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
    }
    // Trucking companies for the per-container carrier dropdown.
    try {
      const res = await fetch('/api/v2/trucking-companies', {
        credentials: 'include',
      });
      if (res.ok) {
        const body = await res.json();
        setTruckingCompanies(body?.data?.trucking_companies ?? []);
      }
    } catch {
      // Non-fatal.
    }
  };

  const togglePromote = (containerId: number) => {
    setPromoteIds((prev) => {
      if (prev.includes(containerId)) {
        // Drop the container + its collected delivery info.
        setDeliveryByContainer((d) => {
          const next = { ...d };
          delete next[containerId];
          return next;
        });
        return prev.filter((x) => x !== containerId);
      }
      // Cap selection at quote.lines.length — every container needs a
      // line to map onto.
      if (quote && prev.length >= quote.lines.length) return prev;
      setDeliveryByContainer((d) =>
        d[containerId] ? d : { ...d, [containerId]: { ...EMPTY_DELIVERY } },
      );
      return [...prev, containerId];
    });
  };

  const updateDelivery = (
    containerId: number,
    patch: Partial<ContainerDelivery>,
  ) => {
    setDeliveryByContainer((d) => ({
      ...d,
      [containerId]: { ...(d[containerId] ?? EMPTY_DELIVERY), ...patch },
    }));
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
          ship_to_same_as_billing: shipSameAsBilling,
          ship_to_name: shipSameAsBilling ? null : shipTo.name || null,
          ship_to_street: shipSameAsBilling ? null : shipTo.street || null,
          ship_to_city: shipSameAsBilling ? null : shipTo.city || null,
          ship_to_state: shipSameAsBilling ? null : shipTo.state || null,
          ship_to_zip: shipSameAsBilling ? null : shipTo.zip || null,
          containers: promoteIds.map((inventory_id) => {
            const d = deliveryByContainer[inventory_id] ?? EMPTY_DELIVERY;
            return {
              inventory_id,
              outbound_trucking_company_id: d.outbound_trucking_company_id,
              door_orientation: d.door_orientation || null,
              delivery_name: d.delivery_same_as_ship ? null : d.delivery_name || null,
              delivery_street: d.delivery_same_as_ship ? null : d.delivery_street || null,
              delivery_city: d.delivery_same_as_ship ? null : d.delivery_city || null,
              delivery_state: d.delivery_same_as_ship ? null : d.delivery_state || null,
              delivery_zip: d.delivery_same_as_ship ? null : d.delivery_zip || null,
            };
          }),
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
        <div className={styles.promoteSection}>
          <div className={styles.promoteSectionHead}>1. Containers</div>
          <p className={styles.promoteHint}>
            Pick up to {quote.lines.length} container
            {quote.lines.length === 1 ? '' : 's'}. The quote's line pricing
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
              const atCap =
                !checked && promoteIds.length >= quote.lines.length;
              return (
                <button
                  key={row.id}
                  type="button"
                  disabled={atCap}
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
                      {mappedLine?.description ? `: ${mappedLine.description}` : ''}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {promoteIds.length > 0 && (
          <>
            <div className={styles.promoteSection}>
              <div className={styles.promoteSectionHead}>2. Ship-to</div>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={shipSameAsBilling}
                  onChange={(e) => setShipSameAsBilling(e.target.checked)}
                />
                Same as billing
              </label>
              {!shipSameAsBilling && (
                <AddressFields
                  value={shipTo}
                  onChange={(next) => setShipTo(next)}
                  nameLabel="Ship to (name)"
                />
              )}
            </div>

            <div className={styles.promoteSection}>
              <div className={styles.promoteSectionHead}>
                3. Per-container delivery
              </div>
              {promoteIds.map((cid, idx) => {
                const row = available.find((r) => r.id === cid);
                const line = quote.lines[idx];
                const d = deliveryByContainer[cid] ?? EMPTY_DELIVERY;
                return (
                  <div key={cid} className={styles.deliveryCard}>
                    <div className={styles.deliveryHead}>
                      <strong>{row?.unit_number.trim()}</strong>{' '}
                      <span className={styles.containerSub}>
                        {row?.size} · {row?.damage}
                      </span>
                      {line?.description && (
                        <span className={styles.deliveryMap}>
                          → {line.description}
                        </span>
                      )}
                    </div>
                    <div className={styles.deliveryGrid}>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          Trucking company
                        </span>
                        <select
                          className={styles.input}
                          value={d.outbound_trucking_company_id ?? ''}
                          onChange={(e) =>
                            updateDelivery(cid, {
                              outbound_trucking_company_id: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                        >
                          <option value="">— none —</option>
                          {truckingCompanies.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.company_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          Door orientation
                        </span>
                        <DoorOrientationField
                          className={styles.input}
                          value={d.door_orientation}
                          onChange={(v) =>
                            updateDelivery(cid, { door_orientation: v })
                          }
                        />
                      </label>
                    </div>
                    {d.delivery_same_as_ship ? (
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() =>
                          updateDelivery(cid, { delivery_same_as_ship: false })
                        }
                      >
                        + Add separate shipping address
                      </button>
                    ) : (
                      <div>
                        <AddressFields
                          value={{
                            name: d.delivery_name,
                            street: d.delivery_street,
                            city: d.delivery_city,
                            state: d.delivery_state,
                            zip: d.delivery_zip,
                          }}
                          onChange={(next) =>
                            updateDelivery(cid, {
                              delivery_name: next.name,
                              delivery_street: next.street,
                              delivery_city: next.city,
                              delivery_state: next.state,
                              delivery_zip: next.zip,
                            })
                          }
                          nameLabel="Deliver to (name)"
                        />
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() =>
                            updateDelivery(cid, {
                              delivery_same_as_ship: true,
                              delivery_name: '',
                              delivery_street: '',
                              delivery_city: '',
                              delivery_state: '',
                              delivery_zip: '',
                            })
                          }
                        >
                          Use shipping address instead
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.promoteSection}>
              <div className={styles.promoteSectionHead}>4. Invoice preview</div>
              <table className={styles.previewTable}>
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Container</th>
                    <th>Description</th>
                    <th className={styles.previewMoney}>Sale</th>
                    <th className={styles.previewMoney}>Trucking</th>
                    <th className={styles.previewMoney}>Mods</th>
                    <th className={styles.previewMoney}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lines.map((line, i) => {
                    const cid = promoteIds[i];
                    const container = cid != null
                      ? available.find((r) => r.id === cid)
                      : null;
                    const sale = Number(line.sale_price ?? 0);
                    const trk = Number(line.trucking_rate ?? 0);
                    const mods = line.modifications.reduce(
                      (s, m) => s + Number(m.price ?? 0),
                      0,
                    );
                    const sub = container ? sale + trk + mods : 0;
                    return (
                      <tr
                        key={line.id}
                        className={container ? '' : styles.previewDropped}
                      >
                        <td>{i + 1}</td>
                        <td>
                          {container ? (
                            container.unit_number.trim()
                          ) : (
                            <em>(dropped — no container)</em>
                          )}
                        </td>
                        <td>{line.description || '—'}</td>
                        <td className={styles.previewMoney}>
                          {container ? fmtCurrency(sale) : '—'}
                        </td>
                        <td className={styles.previewMoney}>
                          {container ? fmtCurrency(trk) : '—'}
                        </td>
                        <td className={styles.previewMoney}>
                          {container ? fmtCurrency(mods) : '—'}
                        </td>
                        <td className={styles.previewMoney}>
                          {container ? fmtCurrency(sub) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className={styles.promoteFooter}>
          <span className={styles.promoteRowMeta}>
            {promoteIds.length} of {quote.lines.length} line
            {quote.lines.length === 1 ? '' : 's'} assigned
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
