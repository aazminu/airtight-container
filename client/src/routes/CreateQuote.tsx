import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  CurrencyInput,
  Flow,
  FlowStep,
  IconButton,
  Stepper,
} from '../components/ui';
import { AddClientModal } from '../components/forms/AddClientModal';
import { DestinationField } from '../components/forms/DestinationField';
import { useDirtyForm } from '../lib/useDirtyForm';
import QuoteTemplate from '../components/templates/quote/QuoteTemplate';
import { fmtCurrency, fmtDate } from '../components/templates/quote/format';
import type {
  QuoteData,
  QuoteLine,
  QuoteModification,
} from '../components/templates/quote/types';
import {
  MODIFICATION_DATALIST_ID,
  useModPresetLabels,
  useModPresets,
} from '../components/forms/modificationPresets';
import styles from './CreateQuote.module.css';

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

interface LineDraft {
  // Local-only key, negative so it never collides with a real row id.
  key: number;
  description: string;
  sale_price: string;
  trucking_rate: string;
  destination: string;
  modifications: Array<{ id: number; description: string; price: string }>;
}

const STEP_NAMES = ['Customer', 'Lines', 'Details', 'Preview', 'Done'] as const;

const TAX_PRESETS = [
  { label: 'NJ 6.625%', rate: '0.06625' },
  { label: 'NY 8.875%', rate: '0.08875' },
  { label: 'Other', rate: '' },
];

let keySeq = -1;
const blankLine = (): LineDraft => ({
  key: keySeq--,
  description: '',
  sale_price: '',
  trucking_rate: '',
  destination: '',
  modifications: [],
});

const customerLabel = (c: ClientRow | null) => {
  if (!c) return '';
  return c.business_name || c.client_name || 'Unknown';
};

const customerCityState = (c: ClientRow | null): string => {
  if (!c) return '';
  const cityState = [c.city, c.state].filter(Boolean).join(', ');
  if (cityState) return [cityState, c.zip].filter(Boolean).join(' ');
  return c.street ?? '';
};

const pctToDecimal = (pct: string): string => {
  if (pct.trim() === '') return '';
  const n = Number(pct);
  if (!Number.isFinite(n)) return '';
  return (n / 100).toString();
};

export default function CreateQuote() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [notes, setNotes] = useState('');
  const [quoteTaxed, setQuoteTaxed] = useState(false);
  const [quoteCredit, setQuoteCredit] = useState(false);
  const [taxRate, setTaxRate] = useState('0.06625');
  const [ccFeePct, setCcFeePct] = useState('3.5');
  const ccFeeRate = pctToDecimal(ccFeePct);
  const modPresetLabels = useModPresetLabels();
  const modPresets = useModPresets();
  const [submitState, setSubmitState] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'error'; message: string }
    | { kind: 'done'; id: number; quote_number: string }
  >({ kind: 'idle' });
  useDirtyForm(
    submitState.kind !== 'done' &&
      (selectedClient !== null || notes.trim() !== ''),
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v2/clients', { credentials: 'include' });
        if (res.ok) {
          const body = await res.json();
          setClients(body.data.clients ?? []);
        }
      } catch {
        // Non-fatal; UI shows an empty picker.
      }
    })();
  }, []);

  // Backfill empty line destinations from the customer's city/state when
  // a customer is picked, so the common "delivery goes to the buyer"
  // case types itself. Only touches still-blank destinations.
  useEffect(() => {
    const dest = customerCityState(selectedClient);
    if (!dest) return;
    setLines((prev) => {
      let changed = false;
      const next = prev.map((l) => {
        if (!l.destination) {
          changed = true;
          return { ...l, destination: dest };
        }
        return l;
      });
      return changed ? next : prev;
    });
  }, [selectedClient]);

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
    for (const l of lines) {
      subtotal += Number(l.sale_price || 0);
      subtotal += Number(l.trucking_rate || 0);
      subtotal += l.modifications.reduce((s, m) => s + Number(m.price || 0), 0);
    }
    const tax = quoteTaxed ? subtotal * Number(taxRate || 0) : 0;
    const cc = quoteCredit ? (subtotal + tax) * Number(ccFeeRate || 0) : 0;
    return { subtotal, tax, cc, total: subtotal + tax + cc };
  }, [lines, quoteTaxed, quoteCredit, taxRate, ccFeeRate]);

  const draftQuote: QuoteData | null = useMemo(() => {
    if (!selectedClient) return null;
    const quoteLines: QuoteLine[] = lines
      .filter((l) => l.description.trim() !== '')
      .map((l, i) => {
        const mods: QuoteModification[] = l.modifications.map((m, j) => ({
          id: m.id,
          quote_line_item_id: -1,
          description: m.description,
          price: m.price || '0',
          position: j,
        }));
        return {
          id: l.key,
          description: l.description,
          sale_price: l.sale_price || null,
          trucking_rate: l.trucking_rate || null,
          destination: l.destination || null,
          position: i,
          modifications: mods,
        };
      });
    return {
      id: 0,
      quote_number: 'PLACEHOLDER',
      quote_taxed: quoteTaxed,
      quote_credit: quoteCredit,
      created_at: new Date().toISOString(),
      notes: notes || null,
      status: 'draft',
      sent_at: null,
      pdf_s3_key: null,
      deleted_at: null,
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
      lines: quoteLines,
    };
  }, [
    selectedClient,
    lines,
    notes,
    quoteTaxed,
    quoteCredit,
    taxRate,
    ccFeeRate,
    totalsPreview,
  ]);

  const updateLine = (key: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, blankLine()]);

  const removeLine = (key: number) =>
    setLines((prev) => prev.filter((l) => l.key !== key));

  const addMod = (key: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              modifications: [
                ...l.modifications,
                {
                  id: -Date.now() - l.modifications.length,
                  description: '',
                  price: '0',
                },
              ],
            }
          : l,
      ),
    );
  };

  const updateMod = (
    key: number,
    modIdx: number,
    patch: Partial<{ description: string; price: string }>,
  ) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const mods = l.modifications.slice();
        const next = { ...mods[modIdx], ...patch };
        if (patch.description !== undefined) {
          const match = modPresets.find(
            (p) => p.label === patch.description?.trim(),
          );
          const currentPrice = Number(next.price);
          const priceEmpty =
            next.price === '' ||
            next.price == null ||
            (Number.isFinite(currentPrice) && currentPrice === 0);
          if (match && match.default_price != null && priceEmpty) {
            next.price = String(match.default_price);
          }
        }
        mods[modIdx] = next;
        return { ...l, modifications: mods };
      }),
    );
  };

  const removeMod = (key: number, modIdx: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              modifications: l.modifications.filter((_, i) => i !== modIdx),
            }
          : l,
      ),
    );
  };

  const validLines = lines.filter((l) => l.description.trim() !== '');

  const canAdvance = () => {
    if (step === 0) return selectedClient != null;
    if (step === 1) {
      return (
        validLines.length > 0 &&
        validLines.every((l) => Number(l.sale_price || 0) > 0)
      );
    }
    return true;
  };

  const submit = async () => {
    if (!selectedClient || validLines.length === 0) return;
    setSubmitState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/v2/quote', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedClient.id,
          quote_taxed: quoteTaxed,
          quote_credit: quoteCredit,
          tax_rate: taxRate || null,
          cc_fee_rate: ccFeeRate || null,
          notes: notes || null,
          lines: validLines.map((l, i) => ({
            description: l.description,
            sale_price: l.sale_price || null,
            trucking_rate: l.trucking_rate || null,
            destination: l.destination || null,
            position: i,
            modifications: l.modifications
              .filter((m) => m.description.trim() !== '')
              .map((m, j) => ({
                description: m.description,
                price: m.price || '0',
                position: j,
              })),
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Create failed: HTTP ${res.status}`);
      }
      const created = (await res.json()) as { id: number; quote_number: string };
      setSubmitState({
        kind: 'done',
        id: created.id,
        quote_number: created.quote_number,
      });
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
        <h1 className={styles.title}>New Quote</h1>
        <span className={styles.stepLabel}>
          Step {Math.min(step + 1, STEP_NAMES.length)} of {STEP_NAMES.length}
        </span>
      </header>

      <Stepper labels={STEP_NAMES} current={step} ariaLabel="Quote progress" />

      {submitState.kind === 'error' && (
        <div className={styles.error}>{submitState.message}</div>
      )}

      <div className={styles.body}>
        <Flow step={step}>
          <FlowStep>
            <p className={styles.hint}>
              Pick the customer this quote goes to. To add a new client first,
              use{' '}
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
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => setAddClientOpen(true)}
            >
              + New client
            </button>
            <AddClientModal
              open={addClientOpen}
              onClose={() => setAddClientOpen(false)}
              onCreated={(client) => {
                const row = client as unknown as ClientRow;
                setClients((cs) => [row, ...cs]);
                setSelectedClient(row);
              }}
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
                    <input type="radio" checked={checked} readOnly tabIndex={-1} />
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
              Add the quote line items. Each line is a free-text description and
              a price — there are no containers on a quote. Sale price is
              required on every line.
            </p>
            <datalist id={MODIFICATION_DATALIST_ID}>
              {modPresetLabels.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>

            {lines.map((l) => (
              <div key={l.key} className={styles.containerCard}>
                <div className={styles.containerHead}>
                  <strong>Line item</strong>
                  <IconButton
                    icon="trash"
                    tone="danger"
                    label="Remove line"
                    onClick={() => removeLine(l.key)}
                    disabled={lines.length === 1}
                  />
                </div>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Description *</span>
                  <input
                    className={styles.input}
                    value={l.description}
                    onChange={(e) =>
                      updateLine(l.key, { description: e.target.value })
                    }
                    placeholder="40'HC WWT"
                  />
                </label>
                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Sale price *</span>
                    <input
                      className={styles.input}
                      type="number"
                      step="0.01"
                      value={l.sale_price}
                      onChange={(e) =>
                        updateLine(l.key, { sale_price: e.target.value })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Trucking</span>
                    <input
                      className={styles.input}
                      type="number"
                      step="0.01"
                      value={l.trucking_rate}
                      onChange={(e) =>
                        updateLine(l.key, { trucking_rate: e.target.value })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Destination</span>
                    <DestinationField
                      value={l.destination || null}
                      onChange={(v) => updateLine(l.key, { destination: v })}
                    />
                  </label>
                </div>

                <div className={styles.modsSection}>
                  <div className={styles.modsHeader}>
                    <span className={styles.fieldLabel}>Modifications</span>
                  </div>
                  {l.modifications.length === 0 && (
                    <p className={styles.modsEmpty}>
                      No modifications yet.
                    </p>
                  )}
                  {l.modifications.map((m, mIdx) => (
                    <div key={m.id} className={styles.modRow}>
                      <input
                        className={styles.input}
                        list={MODIFICATION_DATALIST_ID}
                        placeholder="Description (or pick a preset)"
                        value={m.description}
                        onChange={(e) =>
                          updateMod(l.key, mIdx, { description: e.target.value })
                        }
                      />
                      <CurrencyInput
                        value={m.price}
                        onChange={(v) =>
                          updateMod(l.key, mIdx, { price: v })
                        }
                        placeholder="0.00"
                      />
                      <IconButton
                        icon="trash"
                        tone="danger"
                        label="Remove modification"
                        onClick={() => removeMod(l.key, mIdx)}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.addRow}
                    onClick={() => addMod(l.key)}
                  >
                    + Add modification
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              className={`${styles.addRow} ${styles.addRowFull}`}
              onClick={addLine}
            >
              + Add line item
            </button>

            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Subtotal</span>
                <span>{fmtCurrency(totalsPreview.subtotal)}</span>
              </div>
            </div>
          </FlowStep>

          <FlowStep>
            <p className={styles.hint}>
              Quote-level charges and notes. Totals update live.
            </p>
            <div className={styles.invoiceMetaGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Tax rate</span>
                <select
                  className={styles.input}
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
                    className={styles.input}
                    type="number"
                    step="0.0001"
                    placeholder="e.g. 0.07 for 7%"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                  />
                )}
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  Credit Card fee <span className={styles.fieldHint}>(percent)</span>
                </span>
                <div className={styles.suffixInput}>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    min="0"
                    value={ccFeePct}
                    onChange={(e) => setCcFeePct(e.target.value)}
                  />
                  <span className={styles.suffix}>%</span>
                </div>
              </label>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Charges</span>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={quoteTaxed}
                    onChange={(e) => setQuoteTaxed(e.target.checked)}
                  />
                  Apply sales tax
                </label>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={quoteCredit}
                    onChange={(e) => setQuoteCredit(e.target.checked)}
                  />
                  Add Credit Card fee
                </label>
              </div>
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Notes</span>
              <textarea
                className={styles.input}
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes shown on the quote."
              />
            </label>

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
                <span className={styles.summaryLabel}>Credit Card fee</span>
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
              Review the quote as it will be saved. The number is assigned by
              the server at submit time.
            </p>
            {draftQuote && (
              <div className={styles.previewWrap}>
                <QuoteTemplate data={draftQuote} />
              </div>
            )}
          </FlowStep>

          <FlowStep>
            <div className={styles.doneCard}>
              <Badge tone="success">Created</Badge>
              {submitState.kind === 'done' && (
                <>
                  <div className={styles.doneNumber}>
                    {submitState.quote_number}
                  </div>
                  <p className={styles.hint}>
                    Created for {customerLabel(selectedClient)} on{' '}
                    {fmtDate(new Date().toISOString())}.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button onClick={() => navigate(`/quotes/${submitState.id}`)}>
                      Open quote
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSelectedClient(null);
                        setLines([blankLine()]);
                        setNotes('');
                        setQuoteTaxed(false);
                        setQuoteCredit(false);
                        setSubmitState({ kind: 'idle' });
                        setStep(0);
                      }}
                    >
                      New quote
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
                {submitState.kind === 'submitting' ? 'Submitting…' : 'Create quote'}
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
