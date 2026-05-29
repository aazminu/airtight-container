import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AddressFields,
  Badge,
  Button,
  CurrencyInput,
  Flow,
  FlowStep,
  IconButton,
  Stepper,
} from '../components/ui';
import { AddClientModal } from '../components/forms/AddClientModal';
import { DoorOrientationField } from '../components/forms/DoorOrientationField';
import { useDirtyForm } from '../lib/useDirtyForm';
import InvoiceTemplate from '../components/templates/invoice/InvoiceTemplate';
import { fmtCurrency, fmtDate } from '../components/templates/invoice/format';
import type {
  InvoiceData,
  InvoiceLineContainer,
  InvoiceModification,
} from '../components/templates/invoice/types';
import {
  MODIFICATION_DATALIST_ID,
  useModPresetLabels,
  useModPresets,
} from '../components/forms/modificationPresets';
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
  invoice_notes: string;
  // Per-box delivery (delivery epic). delivery_same_as_ship true → the box
  // inherits the invoice ship-to (which inherits billing); otherwise the
  // operator entered a box-specific address.
  trucking_company_id: number | null;
  door_orientation: string;
  delivery_same_as_ship: boolean;
  delivery_name: string;
  delivery_street: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  modifications: Array<{ id: number; description: string; price: string }>;
}

interface TruckingCompany {
  id: number;
  company_name: string;
  dispatch_name: string | null;
  dispatch_phone: string | null;
}

interface ShipTo {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
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
  invoice_notes: '',
  trucking_company_id: null,
  door_orientation: '',
  delivery_same_as_ship: true,
  delivery_name: '',
  delivery_street: '',
  delivery_city: '',
  delivery_state: '',
  delivery_zip: '',
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

const todayISO = (): string => new Date().toISOString().substring(0, 10);

// User-facing percent ↔ stored decimal rate. We display "3.5" but
// persist 0.035, and similarly for tax rates so server math stays
// consistent across editor + create flow.
const pctToDecimal = (pct: string): string => {
  if (pct.trim() === '') return '';
  const n = Number(pct);
  if (!Number.isFinite(n)) return '';
  return (n / 100).toString();
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
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, ContainerDraft>>({});
  const [invoiceTaxed, setInvoiceTaxed] = useState(false);
  const [invoiceCredit, setInvoiceCredit] = useState(false);
  const [taxRate, setTaxRate] = useState('0.06625');
  // Stored as decimal (0.035), edited as percent ("3.5")
  const [ccFeePct, setCcFeePct] = useState('3.5');
  const ccFeeRate = pctToDecimal(ccFeePct);
  const [invoiceDate, setInvoiceDate] = useState<string>(todayISO);
  // Invoice ship-to (delivery epic). Defaults to the client's billing
  // address; operator can override. Per-box delivery cascades from here.
  const [shipSameAsBilling, setShipSameAsBilling] = useState(true);
  const [shipTo, setShipTo] = useState<ShipTo>({
    name: '',
    street: '',
    city: '',
    state: '',
    zip: '',
  });
  const [truckingCompanies, setTruckingCompanies] = useState<TruckingCompany[]>(
    [],
  );
  const modPresetLabels = useModPresetLabels();
  const modPresets = useModPresets();
  const [submitState, setSubmitState] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'error'; message: string }
    | { kind: 'done'; id: number; invoice_number: number }
  >({ kind: 'idle' });
  useDirtyForm(
    submitState.kind !== 'done' &&
      (selectedIds.length > 0 || selectedClient !== null),
  );

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
      // Non-fatal; dropdown just shows no options.
    }
  };

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
    loadTruckingCompanies();
  }, []);

  // Effective ship-to: the client's billing address when "same as billing"
  // is on, otherwise the operator-entered override. Per-box delivery
  // defaults from this (the 3rd cascade level).
  const effectiveShipTo = (): ShipTo =>
    shipSameAsBilling
      ? {
          name: selectedClient
            ? selectedClient.business_name || selectedClient.client_name || ''
            : '',
          street: selectedClient?.street ?? '',
          city: selectedClient?.city ?? '',
          state: selectedClient?.state ?? '',
          zip: selectedClient?.zip ?? '',
        }
      : shipTo;

  // Resolve a container's delivery address for submit: its own when it has
  // a box-specific address, else the effective ship-to.
  const resolveDelivery = (d: ContainerDraft): ShipTo => {
    if (d.delivery_same_as_ship) return effectiveShipTo();
    return {
      name: d.delivery_name,
      street: d.delivery_street,
      city: d.delivery_city,
      state: d.delivery_state,
      zip: d.delivery_zip,
    };
  };

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
      // 409 duplicate: find the existing one by name.
      if (res.status === 409) {
        const existing = truckingCompanies.find(
          (t) => t.company_name.toLowerCase() === company_name.toLowerCase(),
        );
        return existing?.id ?? null;
      }
    } catch {
      // Non-fatal.
    }
    return null;
  };

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
        destination: (() => {
          // Mirror the server's deriveDestination cascade so the preview
          // shows what the saved sheet will print.
          const city = d?.delivery_city
            || (shipSameAsBilling ? selectedClient?.city : shipTo.city)
            || null;
          const state = d?.delivery_state
            || (shipSameAsBilling ? selectedClient?.state : shipTo.state)
            || null;
          if (!city && !state) return null;
          return [city, state].filter(Boolean).join(', ');
        })(),
        trucking_rate: d?.trucking_rate || null,
        sale_price: d?.sale_price || null,
        modification_price: null,
        // Outbound date is owned by the lifecycle (receipt-print), not the
        // invoice; the preview never collects it.
        outbound_date: null,
        invoice_notes: d?.invoice_notes || null,
        outbound_trucking_company_id: d?.trucking_company_id ?? null,
        door_orientation: d?.door_orientation || null,
        delivery_name: null,
        delivery_street: null,
        delivery_city: null,
        delivery_state: null,
        delivery_zip: null,
        modifications: mods,
      };
    });
    return {
      invoice_id: 0,
      invoice_number: 'PLACEHOLDER',
      invoice_taxed: invoiceTaxed,
      invoice_credit: invoiceCredit,
      invoice_date: invoiceDate
        ? new Date(invoiceDate).toISOString()
        : new Date().toISOString(),
      sent_at: null,
      pdf_s3_key: null,
      deleted_at: null,
      status: 'draft',
      status_changed_at: null,
      status_changed_by_user_id: null,
      subtotal: totalsPreview.subtotal.toFixed(2),
      tax_rate: taxRate || null,
      tax_amount: totalsPreview.tax.toFixed(2),
      cc_fee_rate: ccFeeRate || null,
      cc_fee_amount: totalsPreview.cc.toFixed(2),
      total: totalsPreview.total.toFixed(2),
      ship_to_same_as_billing: shipSameAsBilling,
      ship_to_name: shipSameAsBilling ? null : shipTo.name || null,
      ship_to_street: shipSameAsBilling ? null : shipTo.street || null,
      ship_to_city: shipSameAsBilling ? null : shipTo.city || null,
      ship_to_state: shipSameAsBilling ? null : shipTo.state || null,
      ship_to_zip: shipSameAsBilling ? null : shipTo.zip || null,
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
    invoiceDate,
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
      const next = { ...mods[modIdx], ...patch };
      // Autofill the price when the description matches a preset and
      // the price field is empty / 0 — a typed value wins.
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
              sale_price: d.sale_price,
              release_number: created.invoice_number,
              trucking_rate: d.trucking_rate,
              modification_price: 0,
              invoice_notes: d.invoice_notes,
            }),
          });
        }),
      );

      // 3) Push the full edit shape (mods, tax_rate, cc_fee_rate) via
      //    PUT /:id so the snapshot totals + per-mod line items persist.
      //    POST + per-sold above only handles the legacy scalars.
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
          ship_to_same_as_billing: shipSameAsBilling,
          ship_to_name: shipSameAsBilling ? null : shipTo.name || null,
          ship_to_street: shipSameAsBilling ? null : shipTo.street || null,
          ship_to_city: shipSameAsBilling ? null : shipTo.city || null,
          ship_to_state: shipSameAsBilling ? null : shipTo.state || null,
          ship_to_zip: shipSameAsBilling ? null : shipTo.zip || null,
          containers: selectedIds.map((id) => {
            const d = drafts[id]!;
            const del = resolveDelivery(d);
            return {
              inventory_id: id,
              sale_price: d.sale_price || null,
              trucking_rate: d.trucking_rate || null,
              modification_price: null,
              invoice_notes: d.invoice_notes || null,
              outbound_trucking_company_id: d.trucking_company_id,
              door_orientation: d.door_orientation || null,
              delivery_name: del.name || null,
              delivery_street: del.street || null,
              delivery_city: del.city || null,
              delivery_state: del.state || null,
              delivery_zip: del.zip || null,
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

      <Stepper labels={STEP_NAMES} current={step} ariaLabel="Invoice progress" />

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
            <div className={styles.invoiceMetaGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  Invoice date <span className={styles.fieldHint}>(defaults to today)</span>
                </span>
                <input
                  className={styles.input}
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </label>
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
                    checked={invoiceTaxed}
                    onChange={(e) => setInvoiceTaxed(e.target.checked)}
                  />
                  Apply sales tax
                </label>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={invoiceCredit}
                    onChange={(e) => setInvoiceCredit(e.target.checked)}
                  />
                  Add Credit Card fee
                </label>
              </div>
            </div>
            <datalist id={MODIFICATION_DATALIST_ID}>
              {modPresetLabels.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>

            <div className={styles.containerCard}>
              <div className={styles.containerHead}>
                <strong>Shipping address</strong>
              </div>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={shipSameAsBilling}
                  onChange={(e) => setShipSameAsBilling(e.target.checked)}
                />
                Same as billing address
                {shipSameAsBilling && selectedClient && (
                  <span className={styles.containerSub}>
                    {' '}
                    ({customerCityState(selectedClient) || 'on file'})
                  </span>
                )}
              </label>
              {!shipSameAsBilling && (
                <AddressFields
                  value={shipTo}
                  onChange={(next) => setShipTo(next)}
                  nameLabel="Ship to (name)"
                />
              )}
            </div>

            {selectedIds.map((id) => {
              const d = drafts[id];
              if (!d) return null;
              return (
                <div key={id} className={styles.containerCard}>
                  <div className={styles.containerHead}>
                    <strong>{d.unit_number}</strong>{' '}
                    <span className={styles.containerSub}>
                      {d.size} · {d.damage}
                    </span>
                  </div>
                  <div className={styles.fieldGrid}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Sale price *</span>
                      <CurrencyInput
                        value={d.sale_price}
                        onChange={(v) => updateDraft(id, { sale_price: v })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Trucking</span>
                      <CurrencyInput
                        value={d.trucking_rate}
                        onChange={(v) => updateDraft(id, { trucking_rate: v })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Trucking company</span>
                      <select
                        className={styles.input}
                        value={d.trucking_company_id ?? ''}
                        onChange={async (e) => {
                          if (e.target.value === '__add__') {
                            const name = window.prompt('New trucking company name');
                            if (name && name.trim()) {
                              const newId = await addTruckingCompany(name);
                              if (newId) updateDraft(id, { trucking_company_id: newId });
                            }
                            return;
                          }
                          updateDraft(id, {
                            trucking_company_id: e.target.value
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
                      <span className={styles.fieldLabel}>Door orientation</span>
                      <DoorOrientationField
                        className={styles.input}
                        value={d.door_orientation}
                        onChange={(v) =>
                          updateDraft(id, { door_orientation: v })
                        }
                      />
                    </label>
                  </div>

                  {d.delivery_same_as_ship ? (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() =>
                        updateDraft(id, { delivery_same_as_ship: false })
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
                          updateDraft(id, {
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
                          updateDraft(id, {
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

                  <div className={styles.modsSection}>
                    <div className={styles.modsHeader}>
                      <span className={styles.fieldLabel}>Modifications</span>
                    </div>
                    {d.modifications.map((m, mIdx) => (
                      <div key={m.id} className={styles.modRow}>
                        <input
                          className={styles.input}
                          list={MODIFICATION_DATALIST_ID}
                          placeholder="Description (or pick a preset)"
                          value={m.description}
                          onChange={(e) =>
                            updateMod(id, mIdx, { description: e.target.value })
                          }
                        />
                        <CurrencyInput
                          value={m.price}
                          onChange={(v) => updateMod(id, mIdx, { price: v })}
                          placeholder="0.00"
                        />
                        <IconButton
                          icon="trash"
                          tone="danger"
                          label="Remove modification"
                          onClick={() => removeMod(id, mIdx)}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      className={styles.addRow}
                      onClick={() => addMod(id)}
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
