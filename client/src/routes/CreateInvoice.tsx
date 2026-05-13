import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Flow, FlowStep } from '../components/ui';
import InvoiceTemplate from '../components/templates/invoice/InvoiceTemplate';
import { fmtCurrency, fmtDate } from '../components/templates/invoice/format';
import type {
  InvoiceData,
  InvoiceLineContainer,
  InvoiceModification,
} from '../components/templates/invoice/types';
import styles from './CreateInvoice.module.css';

interface InventoryRow {
  id: number;
  unit_number: string;
  size: string;
  damage: string;
  state: string;
  release_number_id: number | null;
}

interface ClientRow {
  id: number;
  client_name: string;
  business_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface ContainerDraft {
  inventory_id: number;
  unit_number: string;
  size: string;
  damage: string;
  sale_price: string;
  trucking_rate: string;
  destination: string;
  invoice_notes: string;
  outbound_date: string;
  modifications: Array<{ id: number; description: string; price: string }>;
}

const STEP_NAMES = ['Containers', 'Customer', 'Details', 'Preview', 'Done'] as const;

const TAX_PRESETS = [
  { label: 'NJ 6.625%', rate: '0.06625' },
  { label: 'NY 8.875%', rate: '0.08875' },
  { label: 'Other', rate: '' },
];

const blankDraft = (row: InventoryRow): ContainerDraft => ({
  inventory_id: row.id,
  unit_number: row.unit_number,
  size: row.size,
  damage: row.damage,
  sale_price: '',
  trucking_rate: '',
  destination: '',
  invoice_notes: '',
  outbound_date: '',
  modifications: [],
});

const customerLabel = (c: ClientRow | null) => {
  if (!c) return '';
  return c.business_name || c.client_name || 'Unknown';
};

export default function CreateInvoice() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [available, setAvailable] = useState<InventoryRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [containerSearch, setContainerSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [drafts, setDrafts] = useState<Record<number, ContainerDraft>>({});
  const [invoiceTaxed, setInvoiceTaxed] = useState(false);
  const [invoiceCredit, setInvoiceCredit] = useState(false);
  const [taxRate, setTaxRate] = useState('0.06625');
  const [ccFeeRate, setCcFeeRate] = useState('0.035');
  const [submitState, setSubmitState] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'error'; message: string }
    | { kind: 'done'; id: number; invoice_number: number }
  >({ kind: 'idle' });

  useEffect(() => {
    (async () => {
      try {
        const [availRes, clientsRes] = await Promise.all([
          fetch('/api/v1/inventory/state', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: 'available' }),
          }),
          fetch('/api/v2/clients', { credentials: 'include' }),
        ]);
        if (availRes.ok) {
          const body = await availRes.json();
          setAvailable(body.data.inventory ?? []);
        }
        if (clientsRes.ok) {
          const body = await clientsRes.json();
          setClients(body.data.clients ?? []);
        }
      } catch {
        // Non-fatal; UI shows empty pickers and a hint.
      }
    })();
  }, []);

  // Sync drafts with selectedIds so we have one ContainerDraft per
  // selected container, preserving any user edits that already exist.
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<number, ContainerDraft> = {};
      for (const id of selectedIds) {
        if (prev[id]) {
          next[id] = prev[id];
        } else {
          const row = available.find((r) => r.id === id);
          if (row) next[id] = blankDraft(row);
        }
      }
      return next;
    });
  }, [selectedIds, available]);

  const filteredAvailable = useMemo(() => {
    if (!containerSearch.trim()) return available;
    const q = containerSearch.toLowerCase();
    return available.filter((r) =>
      [r.unit_number, r.size, r.damage].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [available, containerSearch]);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter((c) =>
      [c.client_name, c.business_name, c.contact_email, c.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [clients, clientSearch]);

  const totalsPreview = useMemo(() => {
    let subtotal = 0;
    for (const id of selectedIds) {
      const d = drafts[id];
      if (!d) continue;
      subtotal += Number(d.sale_price || 0);
      subtotal += Number(d.trucking_rate || 0);
      subtotal += d.modifications.reduce((s, m) => s + Number(m.price || 0), 0);
    }
    const tax = invoiceTaxed ? subtotal * Number(taxRate || 0) : 0;
    const cc = invoiceCredit ? (subtotal + tax) * Number(ccFeeRate || 0) : 0;
    return { subtotal, tax, cc, total: subtotal + tax + cc };
  }, [selectedIds, drafts, invoiceTaxed, invoiceCredit, taxRate, ccFeeRate]);

  const draftInvoice: InvoiceData | null = useMemo(() => {
    if (!selectedClient || selectedIds.length === 0) return null;
    const containers: InvoiceLineContainer[] = selectedIds.map((id) => {
      const d = drafts[id];
      const mods: InvoiceModification[] = (d?.modifications ?? []).map(
        (m, i) => ({
          id: m.id,
          sold_id: -1,
          description: m.description,
          price: m.price || '0',
          position: i,
        }),
      );
      return {
        inventory_id: id,
        sold_id: null,
        unit_number: d?.unit_number ?? '',
        state: 'sold',
        size: d?.size ?? '',
        damage: d?.damage ?? '',
        destination: d?.destination || null,
        trucking_rate: d?.trucking_rate || null,
        sale_price: d?.sale_price || null,
        modification_price: null,
        outbound_date: d?.outbound_date
          ? new Date(d.outbound_date).toISOString()
          : null,
        invoice_notes: d?.invoice_notes || null,
        modifications: mods,
      };
    });
    return {
      invoice_id: 0,
      invoice_number: 0,
      invoice_taxed: invoiceTaxed,
      invoice_credit: invoiceCredit,
      invoice_date: new Date().toISOString(),
      sent_at: null,
      pdf_s3_key: null,
      subtotal: totalsPreview.subtotal.toFixed(2),
      tax_rate: taxRate || null,
      tax_amount: totalsPreview.tax.toFixed(2),
      cc_fee_rate: ccFeeRate || null,
      cc_fee_amount: totalsPreview.cc.toFixed(2),
      total: totalsPreview.total.toFixed(2),
      customer: {
        id: selectedClient.id,
        client_name: selectedClient.client_name,
        business_name: selectedClient.business_name,
        contact_email: selectedClient.contact_email,
        contact_phone: selectedClient.contact_phone,
        street: selectedClient.street,
        city: selectedClient.city,
        state: selectedClient.state,
        zip: selectedClient.zip,
      },
      containers,
    };
  }, [
    selectedClient,
    selectedIds,
    drafts,
    invoiceTaxed,
    invoiceCredit,
    taxRate,
    ccFeeRate,
    totalsPreview,
  ]);

  const toggleContainer = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const updateDraft = (id: number, patch: Partial<ContainerDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const addMod = (id: number) => {
    setDrafts((prev) => {
      const d = prev[id];
      if (!d) return prev;
      return {
        ...prev,
        [id]: {
          ...d,
          modifications: [
            ...d.modifications,
            { id: -Date.now() - d.modifications.length, description: '', price: '0' },
          ],
        },
      };
    });
  };

  const updateMod = (
    id: number,
    modIdx: number,
    patch: Partial<{ description: string; price: string }>,
  ) => {
    setDrafts((prev) => {
      const d = prev[id];
      if (!d) return prev;
      const mods = d.modifications.slice();
      mods[modIdx] = { ...mods[modIdx], ...patch };
      return { ...prev, [id]: { ...d, modifications: mods } };
    });
  };

  const removeMod = (id: number, modIdx: number) => {
    setDrafts((prev) => {
      const d = prev[id];
      if (!d) return prev;
      return {
        ...prev,
        [id]: {
          ...d,
          modifications: d.modifications.filter((_, i) => i !== modIdx),
        },
      };
    });
  };

  const canAdvance = () => {
    if (step === 0) return selectedIds.length > 0;
    if (step === 1) return selectedClient != null;
    if (step === 2) {
      return selectedIds.every((id) => {
        const d = drafts[id];
        return d && Number(d.sale_price || 0) > 0;
      });
    }
    return true;
  };

  const submit = async () => {
    if (!selectedClient || selectedIds.length === 0) return;
    setSubmitState({ kind: 'submitting' });
    try {
      // 1) Create invoice (server assigns invoice_number via advisory lock).
      const createRes = await fetch('/api/v2/invoice', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: selectedClient.id,
          invoice_taxed: invoiceTaxed,
          invoice_credit: invoiceCredit,
          containers: selectedIds.map((id) => ({ id })),
        }),
      });
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => null);
        throw new Error(body?.message ?? `Create failed: HTTP ${createRes.status}`);
      }
      const created = (await createRes.json()) as {
        id: number;
        invoice_number: number;
      };

      // 2) Mark each container sold (legacy v1 endpoint — sold-row create
      //    + inventory.state flip). Done with the server-assigned number.
      await Promise.all(
        selectedIds.map((id) => {
          const d = drafts[id]!;
          return fetch('/api/v1/inventory/sold', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id,
              destination: d.destination,
              sale_price: d.sale_price,
              release_number: created.invoice_number,
              trucking_rate: d.trucking_rate,
              modification_price: 0,
              invoice_notes: d.invoice_notes,
            }),
          });
        }),
      );

      // 3) Push the full edit shape (mods, tax_rate, cc_fee_rate, outbound
      //    dates) via PUT /:id so the snapshot totals + per-mod line items
      //    persist. POST + per-sold above only handles the legacy scalars.
      const putRes = await fetch(`/api/v2/invoice/${created.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedClient.id,
          invoice_taxed: invoiceTaxed,
          invoice_credit: invoiceCredit,
          tax_rate: taxRate,
          cc_fee_rate: ccFeeRate,
          containers: selectedIds.map((id) => {
            const d = drafts[id]!;
            return {
              inventory_id: id,
              sale_price: d.sale_price || null,
              trucking_rate: d.trucking_rate || null,
              modification_price: null,
              destination: d.destination || null,
              invoice_notes: d.invoice_notes || null,
              outbound_date: d.outbound_date
                ? new Date(d.outbound_date).toISOString()
                : null,
              modifications: d.modifications
                .filter((m) => m.description.trim() !== '')
                .map((m, i) => ({
                  description: m.description,
                  price: m.price || '0',
                  position: i,
                })),
            };
          }),
        }),
      });
      if (!putRes.ok) {
        const body = await putRes.json().catch(() => null);
        throw new Error(body?.message ?? `Save failed: HTTP ${putRes.status}`);
      }

      setSubmitState({ kind: 'done', id: created.id, invoice_number: created.invoice_number });
      setStep(4);
    } catch (e) {
      setSubmitState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Submit failed',
      });
    }
  };

  const taxOption =
    TAX_PRESETS.some((p) => p.rate && p.rate === taxRate) ? taxRate : 'other';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>New Invoice</h1>
        <span className={styles.stepLabel}>
          Step {Math.min(step + 1, STEP_NAMES.length)} of {STEP_NAMES.length}
        </span>
      </header>

      <div className={styles.crumbs}>
        {STEP_NAMES.map((name, i) => (
          <span
            key={name}
            className={`${styles.crumb} ${
              i === step ? styles.active : i < step ? styles.done : ''
            }`}
          >
            {i + 1}. {name}
          </span>
        ))}
      </div>

      {submitState.kind === 'error' && (
        <div className={styles.error}>{submitState.message}</div>
      )}

      <div className={styles.body}>
        <Flow step={step}>
          <FlowStep>
            <p className={styles.hint}>
              Pick the available containers that will be on this invoice. They'll
              switch from "available" to "sold" only after you submit.
            </p>
            <input
              type="search"
              className={styles.search}
              value={containerSearch}
              onChange={(e) => setContainerSearch(e.target.value)}
              placeholder="Search unit #, size, condition…"
            />
            <div className={styles.list}>
              {filteredAvailable.length === 0 && (
                <div className={styles.empty}>
                  No available containers match the search.
                </div>
              )}
              {filteredAvailable.map((row) => {
                const checked = selectedIds.includes(row.id);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`${styles.optionRow} ${checked ? styles.checked : ''}`}
                    onClick={() => toggleContainer(row.id)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      tabIndex={-1}
                    />
                    <span className={styles.optionRowName}>{row.unit_number}</span>
                    <span className={styles.optionRowMeta}>
                      {row.size} · {row.damage}
                    </span>
                  </button>
                );
              })}
            </div>
          </FlowStep>

          <FlowStep>
            <p className={styles.hint}>
              {selectedIds.length} container{selectedIds.length === 1 ? '' : 's'} selected.
              Pick the customer this invoice goes to. To add a new client first, use{' '}
              <a href="/clients" target="_blank" rel="noreferrer">
                /clients
              </a>
              .
            </p>
            <input
              type="search"
              className={styles.search}
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Search name, business, email, city…"
            />
            <div className={styles.list}>
              {filteredClients.length === 0 && (
                <div className={styles.empty}>No clients match the search.</div>
              )}
              {filteredClients.map((c) => {
                const checked = selectedClient?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`${styles.optionRow} ${checked ? styles.checked : ''}`}
                    onClick={() => setSelectedClient(c)}
                  >
                    <input
                      type="radio"
                      checked={checked}
                      readOnly
                      tabIndex={-1}
                    />
                    <span className={styles.optionRowName}>{customerLabel(c)}</span>
                    <span className={styles.optionRowMeta}>
                      {c.contact_email ?? '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          </FlowStep>

          <FlowStep>
            <p className={styles.hint}>
              Fill in per-container prices and invoice-level charges. Totals
              update live. Sale price is required on every container.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem 1rem',
                marginBottom: '1rem',
              }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted, #6e7781)' }}>
                  Tax rate
                </span>
                <select
                  className={styles.search}
                  style={{ margin: 0 }}
                  value={taxOption}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'other') setTaxRate(taxRate || '0');
                    else setTaxRate(v);
                  }}
                >
                  {TAX_PRESETS.map((p) => (
                    <option key={p.label} value={p.rate || 'other'}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {taxOption === 'other' && (
                  <input
                    className={styles.search}
                    style={{ margin: 0 }}
                    type="number"
                    step="0.0001"
                    placeholder="e.g. 0.07"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                  />
                )}
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted, #6e7781)' }}>
                  CC fee rate
                </span>
                <input
                  className={styles.search}
                  style={{ margin: 0 }}
                  type="number"
                  step="0.0001"
                  value={ccFeeRate}
                  onChange={(e) => setCcFeeRate(e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted, #6e7781)' }}>
                  Charges
                </span>
                <label style={{ display: 'flex', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={invoiceTaxed}
                    onChange={(e) => setInvoiceTaxed(e.target.checked)}
                  />
                  Apply sales tax
                </label>
                <label style={{ display: 'flex', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={invoiceCredit}
                    onChange={(e) => setInvoiceCredit(e.target.checked)}
                  />
                  Add credit-card fee
                </label>
              </div>
            </div>
            {selectedIds.map((id) => {
              const d = drafts[id];
              if (!d) return null;
              return (
                <div
                  key={id}
                  style={{
                    border: '1px solid var(--border, #d0d7de)',
                    borderRadius: 8,
                    padding: '0.875rem',
                    marginBottom: '0.875rem',
                    background: 'var(--bg, #fafbfc)',
                  }}
                >
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>{d.unit_number}</strong>{' '}
                    <span style={{ color: 'var(--muted, #6e7781)', fontSize: '0.8125rem' }}>
                      {d.size} · {d.damage}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: '0.5rem 0.75rem',
                    }}
                  >
                    <input
                      className={styles.search}
                      style={{ margin: 0 }}
                      type="number"
                      step="0.01"
                      placeholder="Sale price *"
                      value={d.sale_price}
                      onChange={(e) => updateDraft(id, { sale_price: e.target.value })}
                    />
                    <input
                      className={styles.search}
                      style={{ margin: 0 }}
                      type="number"
                      step="0.01"
                      placeholder="Trucking"
                      value={d.trucking_rate}
                      onChange={(e) => updateDraft(id, { trucking_rate: e.target.value })}
                    />
                    <input
                      className={styles.search}
                      style={{ margin: 0 }}
                      placeholder="Destination"
                      value={d.destination}
                      onChange={(e) => updateDraft(id, { destination: e.target.value })}
                    />
                    <input
                      className={styles.search}
                      style={{ margin: 0 }}
                      placeholder="Notes"
                      value={d.invoice_notes}
                      onChange={(e) => updateDraft(id, { invoice_notes: e.target.value })}
                    />
                    <input
                      className={styles.search}
                      style={{ margin: 0 }}
                      type="date"
                      value={d.outbound_date}
                      onChange={(e) => updateDraft(id, { outbound_date: e.target.value })}
                    />
                  </div>
                  <div style={{ marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted, #6e7781)' }}>
                      Modifications
                    </span>
                    {d.modifications.map((m, mIdx) => (
                      <div
                        key={m.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 120px auto',
                          gap: '0.5rem',
                          marginTop: '0.375rem',
                        }}
                      >
                        <input
                          className={styles.search}
                          style={{ margin: 0 }}
                          placeholder="Description"
                          value={m.description}
                          onChange={(e) =>
                            updateMod(id, mIdx, { description: e.target.value })
                          }
                        />
                        <input
                          className={styles.search}
                          style={{ margin: 0 }}
                          type="number"
                          step="0.01"
                          placeholder="Price"
                          value={m.price}
                          onChange={(e) => updateMod(id, mIdx, { price: e.target.value })}
                        />
                        <button
                          type="button"
                          onClick={() => removeMod(id, mIdx)}
                          style={{
                            width: 32,
                            background: 'transparent',
                            border: '1px solid var(--border, #d0d7de)',
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addMod(id)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        padding: '0.25rem 0',
                        color: 'var(--accent, #0969da)',
                        cursor: 'pointer',
                        fontSize: '0.8125rem',
                        marginTop: '0.375rem',
                      }}
                    >
                      + Add modification
                    </button>
                  </div>
                </div>
              );
            })}

            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Subtotal</span>
                <span>{fmtCurrency(totalsPreview.subtotal)}</span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Tax</span>
                <span>{fmtCurrency(totalsPreview.tax)}</span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>CC fee</span>
                <span>{fmtCurrency(totalsPreview.cc)}</span>
              </div>
              <div className={styles.summaryRow} style={{ fontWeight: 600 }}>
                <span>Total</span>
                <span>{fmtCurrency(totalsPreview.total)}</span>
              </div>
            </div>
          </FlowStep>

          <FlowStep>
            <p className={styles.hint}>
              Review the invoice as it will be saved. The number is assigned by
              the server at submit time.
            </p>
            {draftInvoice && (
              <div className={styles.previewWrap}>
                <InvoiceTemplate data={draftInvoice} />
              </div>
            )}
          </FlowStep>

          <FlowStep>
            <div className={styles.doneCard}>
              <Badge tone="success">Created</Badge>
              {submitState.kind === 'done' && (
                <>
                  <div className={styles.doneNumber}>
                    #{submitState.invoice_number}
                  </div>
                  <p className={styles.hint}>
                    Created for {customerLabel(selectedClient)} on{' '}
                    {fmtDate(new Date().toISOString())}.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      onClick={() => navigate(`/invoices/${submitState.id}`)}
                    >
                      Open invoice
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSelectedIds([]);
                        setSelectedClient(null);
                        setDrafts({});
                        setInvoiceTaxed(false);
                        setInvoiceCredit(false);
                        setSubmitState({ kind: 'idle' });
                        setStep(0);
                      }}
                    >
                      New invoice
                    </Button>
                  </div>
                </>
              )}
            </div>
          </FlowStep>
        </Flow>
      </div>

      {step < 4 && (
        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            ← Back
          </Button>
          <div className={styles.actionsRight}>
            {step === 3 ? (
              <Button
                onClick={submit}
                disabled={submitState.kind === 'submitting' || !canAdvance()}
              >
                {submitState.kind === 'submitting' ? 'Submitting…' : 'Create invoice'}
              </Button>
            ) : (
              <Button
                onClick={() => setStep((s) => Math.min(STEP_NAMES.length - 1, s + 1))}
                disabled={!canAdvance()}
              >
                Next →
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
