import { useEffect, useMemo, useState } from 'react';
import { Button, CurrencyInput, IconButton } from '../ui';
import type { QuoteData } from '../templates/quote/types';
import { fmtCurrency } from '../templates/quote/format';
import {
  MODIFICATION_DATALIST_ID,
  useModPresetLabels,
  useModPresets,
} from './modificationPresets';
import { DestinationField } from './DestinationField';
import styles from '../../routes/CreateQuote.module.css';

interface ClientSummary {
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

interface QuoteEditorProps {
  initial: QuoteData;
  onCancel: () => void;
  onSave: (updated: QuoteData) => Promise<void> | void;
}

// Inline editor for an existing quote. Modeled on the CreateQuote Lines
// + Details steps (free-text lines + per-line mods + tax/cc + notes),
// flattened into a single form. Does NOT import CreateInvoice /
// InvoiceEditor — quotes have no container picker.
export default function QuoteEditor({ initial, onCancel, onSave }: QuoteEditorProps) {
  const [draft, setDraft] = useState<QuoteData>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const modPresetLabels = useModPresetLabels();
  const modPresets = useModPresets();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/clients', { credentials: 'include' });
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        setClients(body?.data?.clients ?? []);
      } catch {
        // Non-fatal — current customer renders via the read-only fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateCustomer = (clientId: number) => {
    const c = clients.find((cl) => cl.id === clientId);
    if (!c) return;
    setDraft((d) => ({
      ...d,
      customer: {
        ...d.customer,
        id: c.id,
        client_name: c.client_name,
        business_name: c.business_name,
        contact_email: c.contact_email,
        contact_phone: c.contact_phone,
        street: c.street,
        city: c.city,
        state: c.state,
        zip: c.zip,
      },
    }));
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    for (const l of draft.lines) {
      subtotal += Number(l.sale_price || 0);
      subtotal += Number(l.trucking_rate || 0);
      subtotal += l.modifications.reduce((s, m) => s + Number(m.price || 0), 0);
    }
    const tax = draft.quote_taxed ? subtotal * Number(draft.tax_rate || 0) : 0;
    const cc = draft.quote_credit
      ? (subtotal + tax) * Number(draft.cc_fee_rate || 0)
      : 0;
    return { subtotal, tax, cc, total: subtotal + tax + cc };
  }, [draft]);

  let keySeq = -1;
  const newKey = () => keySeq--;

  const updateLine = (id: number, patch: Partial<QuoteData['lines'][number]>) => {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  };

  const addLine = () => {
    setDraft((d) => ({
      ...d,
      lines: [
        ...d.lines,
        {
          id: newKey(),
          description: '',
          sale_price: null,
          trucking_rate: null,
          destination: null,
          position: d.lines.length,
          modifications: [],
        },
      ],
    }));
  };

  const removeLine = (id: number) =>
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));

  const addMod = (lineId: number) => {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) =>
        l.id === lineId
          ? {
              ...l,
              modifications: [
                ...l.modifications,
                {
                  id: -Date.now() - l.modifications.length,
                  quote_line_item_id: l.id,
                  description: '',
                  price: '0',
                  position: l.modifications.length,
                },
              ],
            }
          : l,
      ),
    }));
  };

  const updateMod = (
    lineId: number,
    modIdx: number,
    patch: Partial<{ description: string; price: string }>,
  ) => {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => {
        if (l.id !== lineId) return l;
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
    }));
  };

  const removeMod = (lineId: number, modIdx: number) => {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) =>
        l.id === lineId
          ? { ...l, modifications: l.modifications.filter((_, i) => i !== modIdx) }
          : l,
      ),
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const taxPct =
    draft.tax_rate != null ? String(Number(draft.tax_rate) * 100) : '';
  const ccPct =
    draft.cc_fee_rate != null ? String(Number(draft.cc_fee_rate) * 100) : '';

  return (
    <div className={styles.body}>
      <datalist id={MODIFICATION_DATALIST_ID}>
        {modPresetLabels.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <div className={styles.containerCard}>
        <div className={styles.containerHead}>
          <strong>Customer</strong>
        </div>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Customer</span>
          <select
            className={styles.input}
            value={draft.customer.id}
            onChange={(e) => updateCustomer(Number(e.target.value))}
          >
            {!clients.some((c) => c.id === draft.customer.id) && (
              <option value={draft.customer.id}>
                {draft.customer.business_name || draft.customer.client_name}
              </option>
            )}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_name || c.client_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {draft.lines.map((l) => (
        <div key={l.id} className={styles.containerCard}>
          <div className={styles.containerHead}>
            <strong>Line item</strong>
            <IconButton
              icon="trash"
              tone="danger"
              label="Remove line"
              onClick={() => removeLine(l.id)}
            />
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Description *</span>
            <input
              className={styles.input}
              value={l.description}
              onChange={(e) => updateLine(l.id, { description: e.target.value })}
            />
          </label>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Sale price *</span>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                value={l.sale_price ?? ''}
                onChange={(e) =>
                  updateLine(l.id, { sale_price: e.target.value || null })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Trucking</span>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                value={l.trucking_rate ?? ''}
                onChange={(e) =>
                  updateLine(l.id, { trucking_rate: e.target.value || null })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Destination</span>
              <DestinationField
                value={l.destination}
                onChange={(v) => updateLine(l.id, { destination: v })}
              />
            </label>
          </div>

          <div className={styles.modsSection}>
            <div className={styles.modsHeader}>
              <span className={styles.fieldLabel}>Modifications</span>
            </div>
            {l.modifications.map((m, mIdx) => (
              <div key={m.id} className={styles.modRow}>
                <input
                  className={styles.input}
                  list={MODIFICATION_DATALIST_ID}
                  placeholder="Description (or pick a preset)"
                  value={m.description}
                  onChange={(e) =>
                    updateMod(l.id, mIdx, { description: e.target.value })
                  }
                />
                <CurrencyInput
                  value={m.price}
                  onChange={(v) => updateMod(l.id, mIdx, { price: v })}
                  placeholder="0.00"
                />
                <IconButton
                  icon="trash"
                  tone="danger"
                  label="Remove modification"
                  onClick={() => removeMod(l.id, mIdx)}
                />
              </div>
            ))}
            <button
              type="button"
              className={styles.addRow}
              onClick={() => addMod(l.id)}
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

      <div className={styles.invoiceMetaGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Tax rate (percent)</span>
          <input
            className={styles.input}
            type="number"
            step="0.0001"
            value={taxPct}
            onChange={(e) => {
              const v = e.target.value;
              setDraft((d) => ({
                ...d,
                tax_rate: v === '' ? null : String(Number(v) / 100),
              }));
            }}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Credit Card fee (percent)</span>
          <input
            className={styles.input}
            type="number"
            step="0.01"
            value={ccPct}
            onChange={(e) => {
              const v = e.target.value;
              setDraft((d) => ({
                ...d,
                cc_fee_rate: v === '' ? null : String(Number(v) / 100),
              }));
            }}
          />
        </label>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Charges</span>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={draft.quote_taxed}
              onChange={(e) =>
                setDraft((d) => ({ ...d, quote_taxed: e.target.checked }))
              }
            />
            Apply sales tax
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={draft.quote_credit}
              onChange={(e) =>
                setDraft((d) => ({ ...d, quote_credit: e.target.checked }))
              }
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
          value={draft.notes ?? ''}
          onChange={(e) =>
            setDraft((d) => ({ ...d, notes: e.target.value || null }))
          }
        />
      </label>

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Subtotal</span>
          <span>{fmtCurrency(totals.subtotal)}</span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Tax</span>
          <span>{fmtCurrency(totals.tax)}</span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Credit Card fee</span>
          <span>{fmtCurrency(totals.cc)}</span>
        </div>
        <div className={styles.summaryRow} style={{ fontWeight: 600 }}>
          <span>Total</span>
          <span>{fmtCurrency(totals.total)}</span>
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save quote'}
        </Button>
      </div>
    </div>
  );
}
