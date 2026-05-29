import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AddressFields,
  Badge,
  Button,
  Flow,
  FlowStep,
  Stepper,
} from '../components/ui';
import { DoorOrientationField } from '../components/forms/DoorOrientationField';
import DeliveryTemplate from '../components/templates/delivery/DeliveryTemplate';
import type { DeliveryData } from '../components/templates/delivery/types';
import styles from './CreateReport.module.css';

type ReportType =
  | 'delivery_sheet'
  | 'io_report'
  | 'pnl'
  | 'sh_statement'
  | 'release_summary';

const TYPE_LABELS: Record<ReportType, string> = {
  delivery_sheet: 'Delivery sheet',
  io_report: 'In / Out report',
  pnl: 'Profit + Loss',
  sh_statement: 'S&H statement',
  release_summary: 'Release summary',
};

const TYPE_DESCRIPTIONS: Record<ReportType, string> = {
  delivery_sheet:
    'One-pager handed to the driver at outbound. Pulls customer, container, and modifications from the invoice; takes operator-entered fields (delivery company, on-site contact, door orientation, payment details).',
  io_report:
    'Inbound + outbound activity over a date window. Includes container intake and sold-container delivery (sales) as well as S&H box check-ins and pickups.',
  pnl:
    'Profit + Loss for a month, quarter, or year. Sales revenue vs. acquisition + modification cost, plus S&H revenue.',
  sh_statement:
    'Per-client storage & handling statement. Lists every monthly invoice in a date window with in/out fees and storage-day charges.',
  release_summary:
    'Per-release box ledger. Lists every container logged under a release number with state, intake date, and outbound info. Quota + filled count at the top.',
};

const TYPES: ReportType[] = [
  'delivery_sheet',
  'io_report',
  'pnl',
  'sh_statement',
  'release_summary',
];

// Delivery sheets are reached from the "Make delivery sheet" button on an
// invoice (scoped to a specific container), not the generic report picker.
// The /reports/new/delivery_sheet route stays valid — it's just not an
// option on the type-chooser menu.
const PICKABLE_TYPES: ReportType[] = TYPES.filter((t) => t !== 'delivery_sheet');

function isReportType(v: string | undefined): v is ReportType {
  return v != null && (TYPES as string[]).includes(v);
}

export default function CreateReport() {
  const { type } = useParams<{ type?: string }>();
  const navigate = useNavigate();

  if (!type) {
    return (
      <div className={styles.page}>
        <header className={styles.pickerHeader}>
          <h1 className={styles.pickerTitle}>New report</h1>
          <p className={styles.pickerSubtitle}>What kind of report?</p>
        </header>
        <div className={styles.picker}>
          {PICKABLE_TYPES.map((t) => (
            <Link key={t} to={`/reports/new/${t}`} className={styles.pickerCard}>
              <div className={styles.pickerLabel}>{TYPE_LABELS[t]}</div>
              <p className={styles.pickerDesc}>{TYPE_DESCRIPTIONS[t]}</p>
            </Link>
          ))}
        </div>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => navigate('/reports')}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (!isReportType(type)) {
    return (
      <div className={styles.page}>
        <header className={styles.pickerHeader}>
          <h1 className={styles.pickerTitle}>Unknown report type</h1>
          <p className={styles.pickerSubtitle}>"{type}" is not a valid report.</p>
        </header>
        <Link to="/reports/new" className={styles.cancel}>
          ← Back
        </Link>
      </div>
    );
  }

  // Delivery sheet gets the full stepper + preview treatment, mirroring
  // CreateInvoice. The other three are short enough that a single-page
  // form is the right shape.
  if (type === 'delivery_sheet') {
    return <DeliveryFlow />;
  }

  return (
    <div className={styles.page}>
      <header className={styles.pickerHeader}>
        <h1 className={styles.pickerTitle}>{TYPE_LABELS[type]}</h1>
        <p className={styles.pickerSubtitle}>{TYPE_DESCRIPTIONS[type]}</p>
      </header>
      {type === 'io_report' && <IoForm />}
      {type === 'pnl' && <PnlForm />}
      {type === 'sh_statement' && <ShStatementForm />}
      {type === 'release_summary' && <ReleaseSummaryForm />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Shared submit helper
// ──────────────────────────────────────────────────────────────────────

async function submitReport(
  report_type: ReportType,
  parameters: Record<string, unknown>,
): Promise<{ id: number; at_number: string | null } | { error: string }> {
  try {
    const res = await fetch('/api/v2/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ report_type, parameters }),
    });
    const body = await res.json();
    if (!res.ok) {
      return { error: body?.message ?? `HTTP ${res.status}` };
    }
    return {
      id: body?.data?.report?.id,
      at_number: body?.data?.report?.delivery_sheet_number ?? null,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Delivery sheet flow (Stepper-based, mirrors CreateInvoice)
// ──────────────────────────────────────────────────────────────────────

// Two source types: sales containers (inventory.id) and S&H boxes
// (sh_inventory.id). Picker tags each entry; on pick, the form sets
// either container_id or sh_box_id (never both).
type PickerSource = 'sales' | 'sh';

interface PickerOption {
  source: PickerSource;
  id: number;
  unit_number: string;
  size: string;
  damage: string | null;
  state_label: string;
  client_label: string | null; // populated for S&H boxes
}

interface SalesInventoryRow {
  id: number;
  unit_number: string;
  size: string;
  damage: string;
  state: string;
}

interface ShBoxRow {
  id: number;
  unit_number: string;
  size: string;
  damage: string | null;
  state: string;
  client_name: string;
  business_name: string | null;
}

interface DeliveryParamState {
  container_id: number | null;
  sh_box_id: number | null;
  client_id: string;            // string so empty stays empty
  delivery_date_date: string;   // YYYY-MM-DD (date picker)
  delivery_date_time: string;   // HH:MM (time picker)
  onsite_contact: string;
  payment_details: string;
  receipt_note: string;
  receipt_summary: string;
  notes: string;
}

const EMPTY_DELIVERY: DeliveryParamState = {
  container_id: null,
  sh_box_id: null,
  client_id: '',
  delivery_date_date: '',
  delivery_date_time: '',
  onsite_contact: '',
  payment_details: '',
  receipt_note: '',
  receipt_summary: '',
  notes: '',
};

// Per-container delivery edits collected on step 2 (Details). Writes
// back to the sold row via PATCH /api/v2/sold/:inventory_id before the
// report POST, so the invoice's per-box record + future delivery sheets
// see the same data.
interface ContainerEdit {
  door_orientation: string;
  outbound_trucking_company_id: number | null;
  delivery_name: string;
  delivery_street: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
}

const EMPTY_CONTAINER_EDIT: ContainerEdit = {
  door_orientation: '',
  outbound_trucking_company_id: null,
  delivery_name: '',
  delivery_street: '',
  delivery_city: '',
  delivery_state: '',
  delivery_zip: '',
};

interface InvoiceContainerData {
  inventory_id: number;
  unit_number: string;
  size: string;
  damage: string | null;
  state: string;
  door_orientation: string | null;
  outbound_trucking_company_id: number | null;
  delivery_name: string | null;
  delivery_street: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
}

interface TruckingCompanyRow {
  id: number;
  company_name: string;
}

const STEP_NAMES = ['Container', 'Customer', 'Details', 'Preview', 'Done'] as const;

function buildDeliveryParams(s: DeliveryParamState): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (s.sh_box_id != null) params.sh_box_id = s.sh_box_id;
  else if (s.container_id != null) params.container_id = s.container_id;

  if (s.client_id.trim()) params.client_id = parseInt(s.client_id, 10);

  // Combine date + time into a single ISO string. If only date is set,
  // treat as midnight local; if only time is set, ignore (no reference
  // day). Empty leaves the resolver default (sold.outbound_date /
  // sh_inventory.checkout_date) in place.
  if (s.delivery_date_date) {
    const time = s.delivery_date_time || '00:00';
    const local = new Date(`${s.delivery_date_date}T${time}`);
    if (!Number.isNaN(local.getTime())) {
      params.delivery_date = local.toISOString();
    }
  }

  if (s.onsite_contact.trim()) params.onsite_contact = s.onsite_contact.trim();
  if (s.payment_details.trim()) params.payment_details = s.payment_details.trim();
  if (s.receipt_note.trim()) params.receipt_note = s.receipt_note.trim();
  if (s.receipt_summary.trim()) params.receipt_summary = s.receipt_summary.trim();
  if (s.notes.trim()) params.notes = s.notes.trim();

  return params;
}

// The preview endpoint surfaces this exact substring when the sales
// path can't find an invoice. Hide the client_id fallback unless we
// see it.
const NO_INVOICE_MARKER = 'has no invoice and no client_id';

function DeliveryFlow() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Header "Make delivery sheet" button on InvoiceDetail deep-links here
  // with ?invoice_id=<N>. When present the picker is scoped to that
  // invoice's containers only — operator can't escape to global inventory.
  // Legacy ?container_id=<id> entry (preselect + skip picker) still works.
  const prefillInvoiceId = useMemo(() => {
    const raw = searchParams.get('invoice_id');
    if (raw == null) return null;
    const n = parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [searchParams]);
  const prefillContainerId = useMemo(() => {
    const raw = searchParams.get('container_id');
    if (raw == null) return null;
    const n = parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [searchParams]);

  const [step, setStep] = useState(prefillContainerId != null ? 1 : 0);
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [containerSearch, setContainerSearch] = useState('');
  const [params, setParams] = useState<DeliveryParamState>(
    prefillContainerId != null
      ? { ...EMPTY_DELIVERY, container_id: prefillContainerId }
      : EMPTY_DELIVERY,
  );

  // Invoice-scope only: full container records for pre-populating
  // per-box delivery edits on step 2. Index by inventory_id.
  const [invoiceContainersById, setInvoiceContainersById] = useState<
    Map<number, InvoiceContainerData>
  >(() => new Map());
  const [truckingCompanies, setTruckingCompanies] = useState<TruckingCompanyRow[]>([]);
  const [containerEdit, setContainerEdit] = useState<ContainerEdit>(
    EMPTY_CONTAINER_EDIT,
  );
  const [addrOverrideOpen, setAddrOverrideOpen] = useState(false);

  const [preview, setPreview] = useState<DeliveryData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [submitState, setSubmitState] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'error'; message: string }
    | { kind: 'done'; id: number; at_number: string | null }
  >({ kind: 'idle' });

  // Invoice-scoped: pull only that invoice's containers.
  // Global: pull all sold/outbound sales + S&H boxes (legacy entry point).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (prefillInvoiceId != null) {
          const [invRes, truckRes] = await Promise.all([
            fetch(`/api/v2/invoice/${prefillInvoiceId}`, {
              credentials: 'include',
            }),
            fetch('/api/v2/trucking-companies', { credentials: 'include' }),
          ]);
          const body = invRes.ok ? await invRes.json() : null;
          const truckBody = truckRes.ok ? await truckRes.json() : null;
          if (cancelled) return;
          const inv = body?.data?.invoices?.[0];
          const containers: InvoiceContainerData[] = inv?.containers ?? [];
          const list: PickerOption[] = containers.map((c) => ({
            source: 'sales' as const,
            id: c.inventory_id,
            unit_number: c.unit_number,
            size: c.size,
            damage: c.damage,
            state_label: c.state,
            client_label: null,
          }));
          setOptions(list);
          setInvoiceContainersById(
            new Map(containers.map((c) => [c.inventory_id, c])),
          );
          setTruckingCompanies(
            truckBody?.data?.trucking_companies ?? [],
          );
          // Auto-pick when there's only one box on the invoice — operator
          // hits Next on a pre-selected option instead of having to click.
          if (list.length === 1 && prefillContainerId == null) {
            setParams((p) => ({
              ...p,
              container_id: list[0].id,
              sh_box_id: null,
            }));
          }
          return;
        }

        const [salesRes, shRes] = await Promise.all([
          fetch('/api/v1/inventory', { credentials: 'include' }),
          fetch('/api/v2/sh-inventory', { credentials: 'include' }),
        ]);
        const salesBody = salesRes.ok ? await salesRes.json() : null;
        const shBody = shRes.ok ? await shRes.json() : null;
        if (cancelled) return;

        const sales: PickerOption[] = (
          salesBody?.data?.inventory ?? ([] as SalesInventoryRow[])
        )
          .filter(
            (r: SalesInventoryRow) =>
              r.state === 'sold' || r.state === 'outbound',
          )
          .map((r: SalesInventoryRow) => ({
            source: 'sales' as const,
            id: r.id,
            unit_number: r.unit_number,
            size: r.size,
            damage: r.damage,
            state_label: r.state,
            client_label: null,
          }));

        const sh: PickerOption[] = (
          shBody?.data?.boxes ?? ([] as ShBoxRow[])
        )
          .filter((r: ShBoxRow) => r.state === 'in_storage' || r.state === 'checked_out')
          .map((r: ShBoxRow) => ({
            source: 'sh' as const,
            id: r.id,
            unit_number: r.unit_number,
            size: r.size,
            damage: r.damage,
            state_label: r.state,
            client_label: r.business_name || r.client_name,
          }));

        setOptions([...sales, ...sh]);
      } catch {
        // Non-fatal: empty picker.
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefillInvoiceId, prefillContainerId]);

  const filteredOptions = useMemo(() => {
    const q = containerSearch.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (r) =>
        r.unit_number?.toLowerCase().includes(q) ||
        r.size?.toLowerCase().includes(q) ||
        r.damage?.toLowerCase().includes(q) ||
        r.client_label?.toLowerCase().includes(q),
    );
  }, [options, containerSearch]);

  const selected = useMemo(() => {
    if (params.container_id != null)
      return options.find(
        (r) => r.source === 'sales' && r.id === params.container_id,
      );
    if (params.sh_box_id != null)
      return options.find(
        (r) => r.source === 'sh' && r.id === params.sh_box_id,
      );
    return null;
  }, [options, params.container_id, params.sh_box_id]);

  const isShPath = params.sh_box_id != null;

  // No-invoice fallback is only relevant on the sales path AND when the
  // preview-resolve actually surfaced it. S&H boxes always have a
  // linked client, so we never show the fallback for them.
  const showInvoiceFallback =
    !isShPath &&
    previewError != null &&
    previewError.includes(NO_INVOICE_MARKER);

  const pickSales = (id: number) => {
    setParams((p) => ({ ...p, container_id: id, sh_box_id: null }));
    // In invoice-scope mode, seed the per-container edits from whatever
    // the invoice has saved for this box. Operator can change anything.
    const ctr = invoiceContainersById.get(id);
    if (ctr) {
      setContainerEdit({
        door_orientation: ctr.door_orientation ?? '',
        outbound_trucking_company_id: ctr.outbound_trucking_company_id,
        delivery_name: ctr.delivery_name ?? '',
        delivery_street: ctr.delivery_street ?? '',
        delivery_city: ctr.delivery_city ?? '',
        delivery_state: ctr.delivery_state ?? '',
        delivery_zip: ctr.delivery_zip ?? '',
      });
      setAddrOverrideOpen(
        Boolean(
          ctr.delivery_name ||
            ctr.delivery_street ||
            ctr.delivery_city ||
            ctr.delivery_state ||
            ctr.delivery_zip,
        ),
      );
    } else {
      setContainerEdit(EMPTY_CONTAINER_EDIT);
      setAddrOverrideOpen(false);
    }
  };
  const pickSh = (id: number) => {
    setParams((p) => ({ ...p, sh_box_id: id, container_id: null }));
    // S&H boxes don't have a sold row — container-edit doesn't apply.
    setContainerEdit(EMPTY_CONTAINER_EDIT);
    setAddrOverrideOpen(false);
  };

  // Seed container-edit on first load when invoice-scope mode auto-picked
  // a single container (or operator deep-linked with ?container_id).
  useEffect(() => {
    if (params.container_id != null) {
      const ctr = invoiceContainersById.get(params.container_id);
      if (ctr) {
        setContainerEdit({
          door_orientation: ctr.door_orientation ?? '',
          outbound_trucking_company_id: ctr.outbound_trucking_company_id,
          delivery_name: ctr.delivery_name ?? '',
          delivery_street: ctr.delivery_street ?? '',
          delivery_city: ctr.delivery_city ?? '',
          delivery_state: ctr.delivery_state ?? '',
          delivery_zip: ctr.delivery_zip ?? '',
        });
        setAddrOverrideOpen(
          Boolean(
            ctr.delivery_name ||
              ctr.delivery_street ||
              ctr.delivery_city ||
              ctr.delivery_state ||
              ctr.delivery_zip,
          ),
        );
      }
    }
  }, [params.container_id, invoiceContainersById]);

  const addTruckingCompany = async (name: string): Promise<number | null> => {
    try {
      const res = await fetch('/api/v2/trucking-companies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company_name: name.trim() }),
      });
      const body = await res.json();
      if (!res.ok) return null;
      const created: TruckingCompanyRow = body?.data?.trucking_company;
      if (!created) return null;
      setTruckingCompanies((prev) => [...prev, created]);
      return created.id;
    } catch {
      return null;
    }
  };

  const fetchPreview = async () => {
    if (params.container_id == null && params.sh_box_id == null) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch('/api/v2/report/preview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          report_type: 'delivery_sheet',
          parameters: buildDeliveryParams(params),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPreviewError(body?.message ?? `HTTP ${res.status}`);
        setPreview(null);
        return;
      }
      setPreview(body?.data?.resolved_data as DeliveryData);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setPreviewLoading(false);
    }
  };

  // When deep-linked from an invoice we skip the picker, so the Customer
  // step's normal "resolve on entry" (goNext → fetchPreview) never runs.
  // Kick off one preview for the prefilled container on mount.
  useEffect(() => {
    if (prefillContainerId != null) {
      void fetchPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateField = <K extends keyof DeliveryParamState>(
    key: K,
    value: DeliveryParamState[K],
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const canAdvance = () => {
    if (step === 0)
      return params.container_id != null || params.sh_box_id != null;
    if (step === 1) {
      // Require a clean resolver — either we got the customer or the
      // operator filled the fallback (and a refresh has cleared the
      // error).
      return preview != null && previewError == null;
    }
    return true;
  };

  const goNext = async () => {
    const next = Math.min(STEP_NAMES.length - 1, step + 1);
    // Customer (1) resolves the customer so we can short-circuit before
    // any form data is entered; Preview (3) resolves again to render the
    // sheet exactly as it will print.
    if (next === 1 || next === 3) {
      await fetchPreview();
    }
    setStep(next);
  };

  const submit = async () => {
    if (params.container_id == null && params.sh_box_id == null) return;
    setSubmitState({ kind: 'submitting' });

    // Persist any per-container edits back to the sold row first, so
    // the resolver picks them up and the invoice + future sheets see
    // the same values. Sales path + invoice-scope only.
    if (params.container_id != null && prefillInvoiceId != null) {
      try {
        const patchRes = await fetch(
          `/api/v2/sold/${params.container_id}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              door_orientation: containerEdit.door_orientation,
              outbound_trucking_company_id:
                containerEdit.outbound_trucking_company_id,
              delivery_name: addrOverrideOpen
                ? containerEdit.delivery_name
                : '',
              delivery_street: addrOverrideOpen
                ? containerEdit.delivery_street
                : '',
              delivery_city: addrOverrideOpen
                ? containerEdit.delivery_city
                : '',
              delivery_state: addrOverrideOpen
                ? containerEdit.delivery_state
                : '',
              delivery_zip: addrOverrideOpen
                ? containerEdit.delivery_zip
                : '',
            }),
          },
        );
        if (!patchRes.ok) {
          const body = await patchRes.json().catch(() => null);
          setSubmitState({
            kind: 'error',
            message:
              body?.message ?? `Container update failed (HTTP ${patchRes.status})`,
          });
          return;
        }
      } catch (e) {
        setSubmitState({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Container update failed',
        });
        return;
      }
    }

    const result = await submitReport(
      'delivery_sheet',
      buildDeliveryParams(params),
    );
    if ('error' in result) {
      setSubmitState({ kind: 'error', message: result.error });
      return;
    }
    setSubmitState({ kind: 'done', id: result.id, at_number: result.at_number });
    setStep(4);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>New delivery sheet</h1>
        <span className={styles.stepLabel}>
          Step {Math.min(step + 1, STEP_NAMES.length)} of {STEP_NAMES.length}
        </span>
      </header>

      <Stepper labels={STEP_NAMES} current={step} ariaLabel="Delivery sheet progress" />

      {submitState.kind === 'error' && (
        <div className={styles.error}>{submitState.message}</div>
      )}

      <div className={styles.body}>
        <Flow step={step}>
          {/* Step 0 — Container */}
          <FlowStep>
            <p className={styles.hint}>
              Pick the container this delivery sheet is for. Sold/outbound
              sales boxes and stored S&H boxes are eligible.
            </p>
            <input
              type="search"
              className={styles.search}
              placeholder="Search unit #, size, client…"
              value={containerSearch}
              onChange={(e) => setContainerSearch(e.target.value)}
            />
            <div className={styles.list}>
              {optionsLoading && (
                <div className={styles.empty}>Loading containers…</div>
              )}
              {!optionsLoading && filteredOptions.length === 0 && (
                <div className={styles.empty}>No containers match the search.</div>
              )}
              {filteredOptions.map((row) => {
                const checked =
                  row.source === 'sales'
                    ? params.container_id === row.id
                    : params.sh_box_id === row.id;
                return (
                  <button
                    key={`${row.source}-${row.id}`}
                    type="button"
                    className={`${styles.optionRow} ${checked ? styles.checked : ''}`}
                    onClick={() =>
                      row.source === 'sales' ? pickSales(row.id) : pickSh(row.id)
                    }
                  >
                    <input type="radio" checked={checked} readOnly tabIndex={-1} />
                    <span className={styles.optionRowName}>
                      <span
                        className={
                          row.source === 'sales' ? styles.tagSales : styles.tagSh
                        }
                      >
                        {row.source === 'sales' ? 'Sales' : 'S&H'}
                      </span>{' '}
                      {row.unit_number.trim()}
                    </span>
                    <span className={styles.optionRowMeta}>
                      {row.size} · {row.damage || '—'}
                      {row.client_label ? ` · ${row.client_label}` : ''} ·{' '}
                      {row.state_label}
                    </span>
                  </button>
                );
              })}
            </div>
          </FlowStep>

          {/* Step 1 — Customer */}
          <FlowStep>
            <p className={styles.hint}>
              {selected ? (
                <>
                  Selected: <strong>{selected.unit_number.trim()}</strong> (
                  {selected.size}
                  {selected.source === 'sh' ? ', S&H box' : ''}). Customer
                  auto-pulled. Override delivery details on the next step.
                </>
              ) : (
                'Pick a container first.'
              )}
            </p>

            {previewLoading && <div className={styles.hint}>Resolving customer…</div>}
            {previewError && !showInvoiceFallback && (
              <div className={styles.error}>{previewError}</div>
            )}
            {previewError && showInvoiceFallback && (
              <div className={styles.warningBlock}>
                This container hasn't been invoiced yet. Enter the buying
                client's ID below to use the no-invoice fallback, then click
                "Refresh resolved customer".
              </div>
            )}

            {preview && (
              <div className={styles.metaCard}>
                <div className={styles.metaCardHead}>Auto-pulled customer</div>
                <div className={styles.metaGrid}>
                  <MetaCell label="Name">
                    {preview.customer.business_name ||
                      preview.customer.client_name}
                  </MetaCell>
                  <MetaCell label="Phone">{preview.customer.contact_phone}</MetaCell>
                  <MetaCell label="Email">{preview.customer.contact_email}</MetaCell>
                </div>
              </div>
            )}

            {showInvoiceFallback && (
              <div className={styles.fieldGrid}>
                <Field
                  label="Client ID (no-invoice fallback)"
                  hint="Used because the container has no invoice yet"
                >
                  <input
                    type="number"
                    className={styles.input}
                    value={params.client_id}
                    onChange={(e) => updateField('client_id', e.target.value)}
                    placeholder="e.g. 7"
                  />
                </Field>
              </div>
            )}

            <button
              type="button"
              className={styles.linkBtn}
              onClick={fetchPreview}
              disabled={
                previewLoading ||
                (params.container_id == null && params.sh_box_id == null)
              }
            >
              Refresh resolved customer
            </button>
          </FlowStep>

          {/* Step 2 — Details */}
          <FlowStep>
            <p className={styles.hint}>
              All fields optional — anything left blank just won't appear
              on the sheet. Carrier + door orientation + delivery address
              pre-fill from the invoice; edit them here if anything was
              blank or has changed. Edits save back to the invoice's
              per-box record.
            </p>

            {params.container_id != null && prefillInvoiceId != null && (
              <>
                <div className={styles.sectionTitle}>Container delivery</div>
                <div className={styles.fieldGrid}>
                  <Field label="Carrier">
                    <select
                      className={styles.input}
                      value={containerEdit.outbound_trucking_company_id ?? ''}
                      onChange={async (e) => {
                        if (e.target.value === '__add__') {
                          const name = window.prompt('New trucking company name');
                          if (name && name.trim()) {
                            const newId = await addTruckingCompany(name);
                            if (newId)
                              setContainerEdit((c) => ({
                                ...c,
                                outbound_trucking_company_id: newId,
                              }));
                          }
                          return;
                        }
                        setContainerEdit((c) => ({
                          ...c,
                          outbound_trucking_company_id: e.target.value
                            ? Number(e.target.value)
                            : null,
                        }));
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
                  </Field>
                  <Field label="Door orientation">
                    <DoorOrientationField
                      className={styles.input}
                      value={containerEdit.door_orientation}
                      onChange={(v) =>
                        setContainerEdit((c) => ({
                          ...c,
                          door_orientation: v,
                        }))
                      }
                    />
                  </Field>
                </div>

                {!addrOverrideOpen ? (
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => setAddrOverrideOpen(true)}
                  >
                    + Add separate shipping address
                  </button>
                ) : (
                  <div className={styles.addressCard}>
                    <div className={styles.addressCardHead}>
                      Per-box delivery address
                    </div>
                    <p className={styles.addressCardHint}>
                      Defaults to the invoice ship-to (which itself defaults
                      to the client's billing address). Fill these in only
                      when this box is going somewhere different.
                    </p>
                    <AddressFields
                      value={{
                        name: containerEdit.delivery_name,
                        street: containerEdit.delivery_street,
                        city: containerEdit.delivery_city,
                        state: containerEdit.delivery_state,
                        zip: containerEdit.delivery_zip,
                      }}
                      onChange={(next) =>
                        setContainerEdit((c) => ({
                          ...c,
                          delivery_name: next.name,
                          delivery_street: next.street,
                          delivery_city: next.city,
                          delivery_state: next.state,
                          delivery_zip: next.zip,
                        }))
                      }
                      nameLabel="Deliver to (name)"
                    />
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => {
                        setAddrOverrideOpen(false);
                        setContainerEdit((c) => ({
                          ...c,
                          delivery_name: '',
                          delivery_street: '',
                          delivery_city: '',
                          delivery_state: '',
                          delivery_zip: '',
                        }));
                      }}
                    >
                      Use shipping address instead
                    </button>
                  </div>
                )}

                <div className={styles.sectionTitle}>Receiver</div>
              </>
            )}

            <div className={styles.fieldGrid}>
              <Field label="Delivery date">
                <input
                  type="date"
                  className={styles.input}
                  value={params.delivery_date_date}
                  onChange={(e) =>
                    updateField('delivery_date_date', e.target.value)
                  }
                />
              </Field>
              <Field label="Delivery time">
                <input
                  type="time"
                  className={styles.input}
                  value={params.delivery_date_time}
                  onChange={(e) =>
                    updateField('delivery_date_time', e.target.value)
                  }
                />
              </Field>
              <Field label="On-site contact">
                <input
                  className={styles.input}
                  value={params.onsite_contact}
                  onChange={(e) => updateField('onsite_contact', e.target.value)}
                  placeholder="John Doe · 555-0142"
                />
              </Field>
              <Field label="Payment details" wide>
                <input
                  className={styles.input}
                  value={params.payment_details}
                  onChange={(e) => updateField('payment_details', e.target.value)}
                  placeholder="Cash on delivery"
                />
              </Field>
            </div>

            <div className={styles.sectionTitle}>Receipt block</div>
            <div className={styles.fieldGrid}>
              <Field
                label="Receipt note"
                wide
                hint="Left blank = no receipt banner on the sheet"
              >
                <input
                  className={styles.input}
                  value={params.receipt_note}
                  onChange={(e) => updateField('receipt_note', e.target.value)}
                  placeholder='"Standard delivery — call 30 minutes out."'
                />
              </Field>
              <Field
                label="Receipt summary override"
                wide
                hint='Defaults to "1 {size} Weather Tight Container"'
              >
                <input
                  className={styles.input}
                  value={params.receipt_summary}
                  onChange={(e) => updateField('receipt_summary', e.target.value)}
                />
              </Field>
            </div>

            <div className={styles.sectionTitle}>Free-text notes</div>
            <textarea
              className={styles.textarea}
              rows={3}
              value={params.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Tight driveway — back in only"
            />
          </FlowStep>

          {/* Step 3 — Preview */}
          <FlowStep>
            <p className={styles.hint}>
              Review the delivery sheet as it will print. Click "Create delivery
              sheet" to save — the row gets an id assigned by the server.
            </p>
            {previewLoading && (
              <div className={styles.empty}>Resolving…</div>
            )}
            {previewError && (
              <div className={styles.error}>{previewError}</div>
            )}
            {preview && !previewLoading && (
              <div className={styles.previewWrap}>
                <DeliveryTemplate data={preview} />
              </div>
            )}
            <div style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={fetchPreview}
                disabled={previewLoading}
              >
                Refresh preview
              </button>
            </div>
          </FlowStep>

          {/* Step 4 — Done */}
          <FlowStep>
            <div className={styles.doneCard}>
              <Badge tone="success">Created</Badge>
              {submitState.kind === 'done' && (
                <>
                  <div className={styles.doneNumber}>
                    {submitState.at_number ?? `#${submitState.id}`}
                  </div>
                  <p className={styles.hint}>
                    Delivery sheet saved. Open it to render or email the PDF.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      onClick={() => navigate(`/reports/${submitState.id}`)}
                    >
                      Open delivery sheet
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setParams(EMPTY_DELIVERY);
                        setPreview(null);
                        setPreviewError(null);
                        setSubmitState({ kind: 'idle' });
                        setStep(0);
                      }}
                    >
                      New delivery sheet
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
                disabled={submitState.kind === 'submitting' || !preview}
              >
                {submitState.kind === 'submitting'
                  ? 'Submitting…'
                  : 'Create delivery sheet'}
              </Button>
            ) : (
              <Button onClick={goNext} disabled={!canAdvance()}>
                Next →
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.metaCell}>
      <span className={styles.metaCellLabel}>{label}</span>
      <span className={styles.metaCellValue}>{children || '—'}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// In/Out form (single page)
// ──────────────────────────────────────────────────────────────────────

function IoForm() {
  const navigate = useNavigate();
  const [start, setStart] = useState(() =>
    new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
  );
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await submitReport('io_report', {
      start_date: start,
      end_date: end,
    });
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    navigate(`/reports/${result.id}`);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Section title="Date window">
        <Grid>
          <Field label="Start date">
            <input
              type="date"
              className={styles.input}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              className={styles.input}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </Field>
        </Grid>
      </Section>
      <SubmitRow error={error} busy={busy} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
// P&L form (single page)
// ──────────────────────────────────────────────────────────────────────

function PnlForm() {
  const navigate = useNavigate();
  const [granularity, setGranularity] = useState<'month' | 'quarter' | 'year'>(
    'month',
  );
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [quarter, setQuarter] = useState<number>(
    Math.floor(now.getMonth() / 3) + 1,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const period = useMemo(() => {
    if (granularity === 'month') return `${year}-${String(month).padStart(2, '0')}`;
    if (granularity === 'quarter') return `${year}-Q${quarter}`;
    return `${year}`;
  }, [granularity, year, month, quarter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await submitReport('pnl', { granularity, period });
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    navigate(`/reports/${result.id}`);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Section title="Period">
        <Grid>
          <Field label="Granularity">
            <select
              className={styles.input}
              value={granularity}
              onChange={(e) =>
                setGranularity(e.target.value as 'month' | 'quarter' | 'year')
              }
            >
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
              <option value="year">Year</option>
            </select>
          </Field>
          <Field label="Year">
            <input
              type="number"
              className={styles.input}
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || year)}
              min={2000}
              max={2100}
              required
            />
          </Field>
          {granularity === 'month' && (
            <Field label="Month">
              <select
                className={styles.input}
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              >
                {[
                  'January',
                  'February',
                  'March',
                  'April',
                  'May',
                  'June',
                  'July',
                  'August',
                  'September',
                  'October',
                  'November',
                  'December',
                ].map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {granularity === 'quarter' && (
            <Field label="Quarter">
              <select
                className={styles.input}
                value={quarter}
                onChange={(e) => setQuarter(parseInt(e.target.value, 10))}
              >
                <option value={1}>Q1 (Jan – Mar)</option>
                <option value={2}>Q2 (Apr – Jun)</option>
                <option value={3}>Q3 (Jul – Sep)</option>
                <option value={4}>Q4 (Oct – Dec)</option>
              </select>
            </Field>
          )}
        </Grid>
        <div className={styles.hint}>Period key: {period}</div>
      </Section>
      <SubmitRow error={error} busy={busy} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
// S&H statement form (single page)
// ──────────────────────────────────────────────────────────────────────

interface ClientRow {
  id: number;
  client_name: string;
  business_name: string | null;
}

function ShStatementForm() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v2/clients', { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setClients(body?.data?.clients ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter(
        (c) =>
          !q ||
          c.client_name?.toLowerCase().includes(q) ||
          c.business_name?.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [clients, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!clientId) {
      setError('Pick a client first.');
      return;
    }
    setBusy(true);
    const params: Record<string, unknown> = { client_id: clientId };
    if (start) params.start_date = start;
    if (end) params.end_date = end;
    const result = await submitReport('sh_statement', params);
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    navigate(`/reports/${result.id}`);
  };

  const selected = clients.find((c) => c.id === clientId);

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Section title="Client" required>
        <input
          type="search"
          className={styles.input}
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.list}>
          {filtered.map((c) => {
            const checked = clientId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className={`${styles.optionRow} ${checked ? styles.checked : ''}`}
                onClick={() => setClientId(c.id)}
              >
                <input type="radio" checked={checked} readOnly tabIndex={-1} />
                <span className={styles.optionRowName}>
                  {c.business_name || c.client_name}
                </span>
                {c.business_name && c.client_name !== c.business_name && (
                  <span className={styles.optionRowMeta}>{c.client_name}</span>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className={styles.empty}>No matching clients.</div>
          )}
        </div>
        {selected && (
          <div className={styles.hint}>
            Picked: <strong>{selected.business_name || selected.client_name}</strong>
          </div>
        )}
      </Section>

      <Section title="Date window (optional)">
        <Grid>
          <Field label="Start date">
            <input
              type="date"
              className={styles.input}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              className={styles.input}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </Grid>
      </Section>

      <SubmitRow error={error} busy={busy} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Release summary form (single page)
// ──────────────────────────────────────────────────────────────────────

interface ReleaseOption {
  release_id: number;
  release_number: string;
  release_count: number;
  inventory_count: number;
  company: string;
}

function ReleaseSummaryForm() {
  const navigate = useNavigate();
  const [options, setOptions] = useState<ReleaseOption[]>([]);
  const [releaseId, setReleaseId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/release', { credentials: 'include' });
        const body = await res.json();
        if (cancelled) return;
        const flat: ReleaseOption[] = [];
        for (const c of body?.data?.releases ?? []) {
          for (const r of c.numbers ?? []) {
            flat.push({ ...r, company: c.company });
          }
        }
        setOptions(flat);
      } catch {
        // Non-fatal: empty picker.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options.slice(0, 80);
    return options
      .filter(
        (r) =>
          r.release_number?.toLowerCase().includes(q) ||
          r.company?.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [options, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!releaseId) {
      setError('Pick a release first.');
      return;
    }
    setBusy(true);
    const result = await submitReport('release_summary', {
      release_id: releaseId,
    });
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    navigate(`/reports/${result.id}`);
  };

  const selected = options.find((r) => r.release_id === releaseId);

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Section title="Release" required>
        <input
          type="search"
          className={styles.input}
          placeholder="Search release number or company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.list}>
          {filtered.map((r) => {
            const checked = releaseId === r.release_id;
            return (
              <button
                key={r.release_id}
                type="button"
                className={`${styles.optionRow} ${checked ? styles.checked : ''}`}
                onClick={() => setReleaseId(r.release_id)}
              >
                <input type="radio" checked={checked} readOnly tabIndex={-1} />
                <span className={styles.optionRowName}>{r.release_number}</span>
                <span className={styles.optionRowMeta}>
                  {r.company} · {r.inventory_count}/{r.release_count}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className={styles.empty}>No matching releases.</div>
          )}
        </div>
        {selected && (
          <div className={styles.hint}>
            Picked: <strong>{selected.release_number}</strong> ({selected.company}) —{' '}
            {selected.inventory_count}/{selected.release_count} filled.
          </div>
        )}
      </Section>

      <SubmitRow error={error} busy={busy} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Shared layout helpers (single-page forms + delivery flow)
// ──────────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
  required,
  hint,
}: {
  title: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionHeading}>
        {title}
        {required && <span className={styles.required}> *</span>}
      </h2>
      {hint && <p className={styles.fieldHint}>{hint}</p>}
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className={styles.fieldGrid}>{children}</div>;
}

function Field({
  label,
  children,
  wide,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  hint?: string;
}) {
  return (
    <label className={`${styles.field} ${wide ? styles.fieldWide : ''}`}>
      <span className={styles.fieldLabel}>
        {label}
        {hint && <span className={styles.fieldLabelHint}> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function SubmitRow({ error, busy }: { error: string | null; busy: boolean }) {
  const navigate = useNavigate();
  return (
    <>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.submitRow}>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => navigate('/reports')}
        >
          Cancel
        </button>
        <button type="submit" className={styles.submit} disabled={busy}>
          {busy ? 'Generating…' : 'Generate report'}
        </button>
      </div>
    </>
  );
}
