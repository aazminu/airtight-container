import { useEffect, useMemo, useState } from 'react';
import type {
  InvoiceData,
  InvoiceLineContainer,
  InvoiceModification,
} from '../templates/invoice/types';
import { Button } from '../ui';
import { fmtCurrency } from '../templates/invoice/format';
import {
  MODIFICATION_DATALIST_ID,
  useModPresetLabels,
  useModPresets,
} from './modificationPresets';
import styles from './InvoiceEditor.module.css';

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

interface InventoryRow {
  id: number;
  unit_number: string;
  size: string;
  damage: string;
  state: string;
}

interface InvoiceEditorProps {
  initial: InvoiceData;
  onCancel: () => void;
  onSave: (updated: InvoiceData) => Promise<void> | void;
}

const TAX_PRESETS: Array<{ label: string; rate: string }> = [
  { label: 'NJ 6.625%', rate: '0.06625' },
  { label: 'NY 8.875%', rate: '0.08875' },
  { label: 'Other', rate: '' },
];

const isPreset = (rate: string | null) =>
  rate != null && TAX_PRESETS.some((p) => p.rate && p.rate === rate);

const asISODate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().substring(0, 10);
};

export default function InvoiceEditor({
  initial,
  onCancel,
  onSave,
}: InvoiceEditorProps) {
  const [draft, setDraft] = useState<InvoiceData>(() => structuredClone(initial));
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [available, setAvailable] = useState<InventoryRow[]>([]);
  const [truckingCompanies, setTruckingCompanies] = useState<
    { id: number; company_name: string }[]
  >([]);
  const [pickerValue, setPickerValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const modPresetLabels = useModPresetLabels();
  const modPresets = useModPresets();

  const loadTruckingCompanies = async () => {
    try {
      const res = await fetch('/api/v2/trucking-companies', {
        credentials: 'include',
      });
      if (res.ok) {
        const body = await res.json();
        setTruckingCompanies(body.data.trucking_companies ?? []);
      }
    } catch {
      // Non-fatal.
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [clientsRes, availRes] = await Promise.all([
          fetch('/api/v2/clients', { credentials: 'include' }),
          fetch('/api/v1/inventory/state', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: 'available' }),
          }),
        ]);
        if (cancelled) return;
        if (clientsRes.ok) {
          const body = await clientsRes.json();
          setClients(body.data.clients ?? []);
        }
        if (availRes.ok) {
          const body = await availRes.json();
          setAvailable(body.data.inventory ?? []);
        }
      } catch {
        // Non-fatal; pickers will be empty but the rest of the form works.
      }
    })();
    loadTruckingCompanies();
    return () => {
      cancelled = true;
    };
  }, []);

  const addTruckingCompany = async (name: string): Promise<number | null> => {
    const company_name = name.trim();
    if (!company_name) return null;
    try {
      const res = await fetch('/api/v2/trucking-companies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name }),
      });
      if (res.ok) {
        const body = await res.json();
        await loadTruckingCompanies();
        return body.data.trucking_company.id as number;
      }
      if (res.status === 409) {
        return (
          truckingCompanies.find(
            (t) => t.company_name.toLowerCase() === company_name.toLowerCase(),
          )?.id ?? null
        );
      }
    } catch {
      // Non-fatal.
    }
    return null;
  };

  const DOOR_ORIENTATION_DATALIST_ID = 'invedit-door-orientations';

  // Recompute totals on the fly as the draft changes. Server will
  // recompute authoritatively at save time; this preview is just so
  // the admin sees what the new totals will be before committing.
  const totalsPreview = useMemo(() => {
    let subtotal = 0;
    for (const c of draft.containers) {
      subtotal += Number(c.sale_price ?? 0);
      subtotal += Number(c.trucking_rate ?? 0);
      const perMod = c.modifications.reduce(
        (sum, m) => sum + Number(m.price ?? 0),
        0,
      );
      if (perMod > 0) subtotal += perMod;
      else subtotal += Number(c.modification_price ?? 0);
    }
    const taxRate = Number(draft.tax_rate ?? 0);
    const ccRate = Number(draft.cc_fee_rate ?? 0);
    const tax = draft.invoice_taxed ? subtotal * taxRate : 0;
    const cc = draft.invoice_credit ? (subtotal + tax) * ccRate : 0;
    return { subtotal, tax, cc, total: subtotal + tax + cc };
  }, [draft]);

  const updateInvoice = <K extends keyof InvoiceData>(
    key: K,
    value: InvoiceData[K],
  ) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const updateCustomer = (clientId: number) => {
    const c = clients.find((cl) => cl.id === clientId);
    if (!c) return;
    setDraft((d) => ({
      ...d,
      customer: {
        ...d.customer,
        id: c.id,
        contact_id: c.id,
        client_name: c.client_name,
        contact_name: c.client_name,
        business_name: c.business_name,
        contact_email: c.contact_email,
        contact_phone: c.contact_phone,
        street: c.street,
        city: c.city,
        state: c.state,
        zip: c.zip,
        contact_address: [c.street, [c.city, c.state].filter(Boolean).join(', '), c.zip]
          .filter(Boolean)
          .join(', '),
      },
    }));
  };

  const updateContainer = (
    idx: number,
    patch: Partial<InvoiceLineContainer>,
  ) => {
    setDraft((d) => {
      const containers = d.containers.slice();
      containers[idx] = { ...containers[idx], ...patch };
      return { ...d, containers };
    });
  };

  const removeContainer = (idx: number) => {
    setDraft((d) => ({
      ...d,
      containers: d.containers.filter((_, i) => i !== idx),
    }));
  };

  const addContainer = () => {
    const id = Number(pickerValue);
    if (!Number.isFinite(id) || id <= 0) return;
    const row = available.find((r) => r.id === id);
    if (!row) return;
    if (draft.containers.some((c) => c.inventory_id === id)) return;
    setDraft((d) => ({
      ...d,
      containers: [
        ...d.containers,
        {
          inventory_id: id,
          sold_id: null,
          unit_number: row.unit_number,
          state: row.state,
          size: row.size,
          damage: row.damage,
          destination: null,
          trucking_rate: null,
          sale_price: null,
          modification_price: null,
          outbound_date: null,
          invoice_notes: null,
          outbound_trucking_company_id: null,
          door_orientation: null,
          delivery_name: null,
          delivery_street: null,
          delivery_city: null,
          delivery_state: null,
          delivery_zip: null,
          modifications: [],
        },
      ],
    }));
    setPickerValue('');
  };

  const updateMod = (
    ctIdx: number,
    modIdx: number,
    patch: Partial<InvoiceModification>,
  ) => {
    setDraft((d) => {
      const containers = d.containers.slice();
      const mods = containers[ctIdx].modifications.slice();
      const next = { ...mods[modIdx], ...patch };
      // Autofill the price when the user picks (or types) a description
      // matching a preset, but only when the current price is empty/0 —
      // a typed value wins.
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
      containers[ctIdx] = { ...containers[ctIdx], modifications: mods };
      return { ...d, containers };
    });
  };

  const addMod = (ctIdx: number) => {
    setDraft((d) => {
      const containers = d.containers.slice();
      const mods = containers[ctIdx].modifications.slice();
      mods.push({
        id: -Date.now() - mods.length,
        sold_id: containers[ctIdx].sold_id ?? -1,
        description: '',
        price: '0',
        position: mods.length,
      });
      containers[ctIdx] = { ...containers[ctIdx], modifications: mods };
      return { ...d, containers };
    });
  };

  const removeMod = (ctIdx: number, modIdx: number) => {
    setDraft((d) => {
      const containers = d.containers.slice();
      const mods = containers[ctIdx].modifications.filter((_, i) => i !== modIdx);
      containers[ctIdx] = { ...containers[ctIdx], modifications: mods };
      return { ...d, containers };
    });
  };

  const moveMod = (ctIdx: number, modIdx: number, delta: -1 | 1) => {
    setDraft((d) => {
      const containers = d.containers.slice();
      const mods = containers[ctIdx].modifications.slice();
      const target = modIdx + delta;
      if (target < 0 || target >= mods.length) return d;
      [mods[modIdx], mods[target]] = [mods[target], mods[modIdx]];
      containers[ctIdx] = { ...containers[ctIdx], modifications: mods };
      return { ...d, containers };
    });
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const taxOption = isPreset(draft.tax_rate) ? draft.tax_rate ?? '' : 'other';

  return (
    <div className={styles.editor}>
      <datalist id={MODIFICATION_DATALIST_ID}>
        {modPresetLabels.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <datalist id={DOOR_ORIENTATION_DATALIST_ID}>
        <option value="Doors to Cab" />
        <option value="Doors to Rear" />
      </datalist>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Invoice</h2>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span className={styles.label}>Customer</span>
            <select
              className={styles.select}
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
          <label className={styles.field}>
            <span className={styles.label}>Invoice date</span>
            <input
              type="date"
              className={styles.input}
              value={asISODate(draft.invoice_date)}
              onChange={(e) =>
                updateInvoice(
                  'invoice_date',
                  e.target.value ? new Date(e.target.value).toISOString() : draft.invoice_date,
                )
              }
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Tax rate</span>
            <select
              className={styles.select}
              value={taxOption}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'other') {
                  updateInvoice('tax_rate', draft.tax_rate ?? '0');
                } else {
                  updateInvoice('tax_rate', v);
                }
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
                value={draft.tax_rate ?? ''}
                placeholder="e.g. 0.07 for 7%"
                onChange={(e) => updateInvoice('tax_rate', e.target.value)}
              />
            )}
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Credit Card fee (percent)</span>
            <div className={styles.suffixInput}>
              <input
                type="number"
                step="0.01"
                min="0"
                className={styles.input}
                value={
                  draft.cc_fee_rate != null && draft.cc_fee_rate !== ''
                    ? String(Number(draft.cc_fee_rate) * 100)
                    : ''
                }
                onChange={(e) => {
                  const pct = e.target.value;
                  if (pct === '') {
                    updateInvoice('cc_fee_rate', null);
                  } else {
                    const n = Number(pct);
                    updateInvoice(
                      'cc_fee_rate',
                      Number.isFinite(n) ? String(n / 100) : null,
                    );
                  }
                }}
              />
              <span className={styles.suffix}>%</span>
            </div>
          </label>
          <div className={styles.field}>
            <span className={styles.label}>Charges</span>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={!!draft.invoice_taxed}
                onChange={(e) => updateInvoice('invoice_taxed', e.target.checked)}
              />
              Apply sales tax
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={!!draft.invoice_credit}
                onChange={(e) => updateInvoice('invoice_credit', e.target.checked)}
              />
              Add Credit Card fee
            </label>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Shipping address</h2>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={draft.ship_to_same_as_billing}
            onChange={(e) =>
              updateInvoice('ship_to_same_as_billing', e.target.checked)
            }
          />
          Same as billing address
        </label>
        {!draft.ship_to_same_as_billing && (
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Ship to (name)</span>
              <input
                className={styles.input}
                value={draft.ship_to_name ?? ''}
                onChange={(e) => updateInvoice('ship_to_name', e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Street</span>
              <input
                className={styles.input}
                value={draft.ship_to_street ?? ''}
                onChange={(e) => updateInvoice('ship_to_street', e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>City</span>
              <input
                className={styles.input}
                value={draft.ship_to_city ?? ''}
                onChange={(e) => updateInvoice('ship_to_city', e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>State</span>
              <input
                className={styles.input}
                value={draft.ship_to_state ?? ''}
                onChange={(e) => updateInvoice('ship_to_state', e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>ZIP</span>
              <input
                className={styles.input}
                value={draft.ship_to_zip ?? ''}
                onChange={(e) => updateInvoice('ship_to_zip', e.target.value)}
              />
            </label>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Containers ({draft.containers.length})
        </h2>
        {draft.containers.length === 0 && (
          <div className={styles.warning}>
            No containers on this invoice. Add one below.
          </div>
        )}
        {draft.containers.map((c, ctIdx) => (
          <div key={c.inventory_id} className={styles.containerCard}>
            <div className={styles.containerHead}>
              <div>
                <span className={styles.containerTitle}>{c.unit_number}</span>{' '}
                <span className={styles.containerSub}>
                  {c.size} · {c.damage}
                </span>
              </div>
              <button
                type="button"
                className={`${styles.linkBtn} ${styles.linkBtnDanger}`}
                onClick={() => removeContainer(ctIdx)}
              >
                Remove container
              </button>
            </div>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span className={styles.label}>Sale price</span>
                <input
                  className={styles.input}
                  type="number"
                  step="0.01"
                  value={c.sale_price ?? ''}
                  onChange={(e) => updateContainer(ctIdx, { sale_price: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Trucking rate</span>
                <input
                  className={styles.input}
                  type="number"
                  step="0.01"
                  value={c.trucking_rate ?? ''}
                  onChange={(e) => updateContainer(ctIdx, { trucking_rate: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Destination</span>
                <input
                  className={styles.input}
                  value={c.destination ?? ''}
                  onChange={(e) => updateContainer(ctIdx, { destination: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Trucking company</span>
                <select
                  className={styles.input}
                  value={c.outbound_trucking_company_id ?? ''}
                  onChange={async (e) => {
                    if (e.target.value === '__add__') {
                      const name = window.prompt('New trucking company name');
                      if (name && name.trim()) {
                        const newId = await addTruckingCompany(name);
                        if (newId)
                          updateContainer(ctIdx, {
                            outbound_trucking_company_id: newId,
                          });
                      }
                      return;
                    }
                    updateContainer(ctIdx, {
                      outbound_trucking_company_id: e.target.value
                        ? Number(e.target.value)
                        : null,
                    });
                  }}
                >
                  <option value="">— none —</option>
                  {truckingCompanies.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.company_name}
                    </option>
                  ))}
                  <option value="__add__">+ Add new company…</option>
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Door orientation</span>
                <input
                  className={styles.input}
                  list={DOOR_ORIENTATION_DATALIST_ID}
                  value={c.door_orientation ?? ''}
                  onChange={(e) =>
                    updateContainer(ctIdx, { door_orientation: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Deliver to (name)</span>
                <input
                  className={styles.input}
                  value={c.delivery_name ?? ''}
                  onChange={(e) => updateContainer(ctIdx, { delivery_name: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Delivery street</span>
                <input
                  className={styles.input}
                  value={c.delivery_street ?? ''}
                  onChange={(e) => updateContainer(ctIdx, { delivery_street: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Delivery city</span>
                <input
                  className={styles.input}
                  value={c.delivery_city ?? ''}
                  onChange={(e) => updateContainer(ctIdx, { delivery_city: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Delivery state</span>
                <input
                  className={styles.input}
                  value={c.delivery_state ?? ''}
                  onChange={(e) => updateContainer(ctIdx, { delivery_state: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Delivery ZIP</span>
                <input
                  className={styles.input}
                  value={c.delivery_zip ?? ''}
                  onChange={(e) => updateContainer(ctIdx, { delivery_zip: e.target.value })}
                />
              </label>
              {c.modifications.length === 0 && (
                <label className={styles.field}>
                  <span className={styles.label}>Legacy mod (one-line)</span>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    value={c.modification_price ?? ''}
                    placeholder="Use per-mod line items below for new invoices"
                    onChange={(e) =>
                      updateContainer(ctIdx, { modification_price: e.target.value })
                    }
                  />
                </label>
              )}
            </div>
            <div className={styles.modsList}>
              <div className={styles.modsHeader}>
                <span className={styles.label}>Per-modification line items</span>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => addMod(ctIdx)}
                >
                  + Add modification
                </button>
              </div>
              {c.modifications.map((m, mIdx) => (
                <div key={m.id} className={styles.modRow}>
                  <input
                    className={styles.input}
                    list={MODIFICATION_DATALIST_ID}
                    placeholder="Description (or pick a preset)"
                    value={m.description}
                    onChange={(e) =>
                      updateMod(ctIdx, mIdx, { description: e.target.value })
                    }
                  />
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    placeholder="Price"
                    value={m.price}
                    onChange={(e) => updateMod(ctIdx, mIdx, { price: e.target.value })}
                  />
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => moveMod(ctIdx, mIdx, -1)}
                    disabled={mIdx === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => moveMod(ctIdx, mIdx, 1)}
                    disabled={mIdx === c.modifications.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => removeMod(ctIdx, mIdx)}
                    aria-label="Remove modification"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className={styles.addContainer}>
          <select
            className={styles.select}
            value={pickerValue}
            onChange={(e) => setPickerValue(e.target.value)}
          >
            <option value="">Pick an available container…</option>
            {available
              .filter((r) => !draft.containers.some((c) => c.inventory_id === r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.unit_number} — {r.size} {r.damage ? `(${r.damage})` : ''}
                </option>
              ))}
          </select>
          <Button variant="secondary" onClick={addContainer} disabled={!pickerValue}>
            + Add container
          </Button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Totals (preview)</h2>
        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Subtotal</span>
            <span className={styles.totalValue}>
              {fmtCurrency(totalsPreview.subtotal)}
            </span>
          </div>
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Tax</span>
            <span className={styles.totalValue}>
              {fmtCurrency(totalsPreview.tax)}
            </span>
          </div>
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Credit Card fee</span>
            <span className={styles.totalValue}>
              {fmtCurrency(totalsPreview.cc)}
            </span>
          </div>
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Total</span>
            <span className={styles.totalValue}>
              {fmtCurrency(totalsPreview.total)}
            </span>
          </div>
        </div>
      </section>

      <div className={styles.formActions}>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
