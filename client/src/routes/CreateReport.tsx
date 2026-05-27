import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge, Button, Flow, FlowStep, Stepper } from '../components/ui';
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
  delivery_company: string;
  onsite_contact: string;
  door_orientation: string;
  payment_details: string;
  receipt_note: string;
  receipt_summary: string;
  addr_name: string;
  addr_street: string;
  addr_locality: string;
  notes: string;
  // Driver-receipt contact (PR 9.6). Optional — operator can skip
  // this step and get prompted at Send-to-Driver time on ReportDetail.
  driver_name: string;
  driver_phone: string;
  driver_email: string;
}

const EMPTY_DELIVERY: DeliveryParamState = {
  container_id: null,
  sh_box_id: null,
  client_id: '',
  delivery_date_date: '',
  delivery_date_time: '',
  delivery_company: '',
  onsite_contact: '',
  door_orientation: '',
  payment_details: '',
  receipt_note: '',
  receipt_summary: '',
  addr_name: '',
  addr_street: '',
  addr_locality: '',
  notes: '',
  driver_name: '',
  driver_phone: '',
  driver_email: '',
};

const STEP_NAMES = ['Container', 'Customer', 'Details', 'Driver', 'Preview', 'Done'] as const;

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

  if (s.delivery_company.trim()) params.delivery_company = s.delivery_company.trim();
  if (s.onsite_contact.trim()) params.onsite_contact = s.onsite_contact.trim();
  if (s.door_orientation.trim()) params.door_orientation = s.door_orientation.trim();
  if (s.payment_details.trim()) params.payment_details = s.payment_details.trim();
  if (s.receipt_note.trim()) params.receipt_note = s.receipt_note.trim();
  if (s.receipt_summary.trim()) params.receipt_summary = s.receipt_summary.trim();
  if (s.notes.trim()) params.notes = s.notes.trim();
  const addr: Record<string, string> = {};
  if (s.addr_name.trim()) addr.name = s.addr_name.trim();
  if (s.addr_street.trim()) addr.street = s.addr_street.trim();
  if (s.addr_locality.trim()) addr.locality = s.addr_locality.trim();
  if (Object.keys(addr).length > 0) params.delivery_address = addr;

  // Driver contact — only emit the sub-object when at least one field
  // is filled, so an empty step submits as no driver-contact at all
  // (and the Send-to-Driver modal prompts at send time).
  const dc: Record<string, string> = {};
  if (s.driver_name.trim()) dc.name = s.driver_name.trim();
  if (s.driver_phone.trim()) dc.phone = s.driver_phone.trim();
  if (s.driver_email.trim()) dc.email = s.driver_email.trim();
  if (Object.keys(dc).length > 0) params.driver_contact = dc;

  return params;
}

// The preview endpoint surfaces this exact substring when the sales
// path can't find an invoice. Hide the client_id fallback unless we
// see it.
const NO_INVOICE_MARKER = 'has no invoice and no client_id';

function DeliveryFlow() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Invoice-detail's "Make delivery sheet" button deep-links here with
  // ?container_id=<id> (the sales container). When present we preselect
  // it and skip the picker so the operator lands on the Customer step.
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

  const [preview, setPreview] = useState<DeliveryData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [submitState, setSubmitState] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'error'; message: string }
    | { kind: 'done'; id: number; at_number: string | null }
  >({ kind: 'idle' });

  // Load both sales inventory (sold/outbound) and S&H boxes (in_storage).
  // Delivery sheets only make sense for boxes that are about to leave
  // the yard — available containers aren't bound to a customer yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
  }, []);

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

  const pickSales = (id: number) =>
    setParams((p) => ({ ...p, container_id: id, sh_box_id: null }));
  const pickSh = (id: number) =>
    setParams((p) => ({ ...p, sh_box_id: id, container_id: null }));

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
    // Preview slot moved from step 3 → step 4 after the Driver step
    // was inserted. Step 1 (Customer) also runs the resolver so the
    // customer-resolution check can short-circuit before the operator
    // fills in form data.
    if (next === 1 || next === 4) {
      await fetchPreview();
    }
    setStep(next);
  };

  const submit = async () => {
    if (params.container_id == null && params.sh_box_id == null) return;
    setSubmitState({ kind: 'submitting' });
    const result = await submitReport(
      'delivery_sheet',
      buildDeliveryParams(params),
    );
    if ('error' in result) {
      setSubmitState({ kind: 'error', message: result.error });
      return;
    }
    setSubmitState({ kind: 'done', id: result.id, at_number: result.at_number });
    setStep(5);
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
                  {selected.source === 'sh' ? ', S&H box' : ''}). Customer +
                  delivery address auto-pulled — override below if needed.
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

            <div className={styles.addressCard}>
              <div className={styles.addressCardHead}>
                Delivery address override
              </div>
              <p className={styles.addressCardHint}>
                The customer's billing address is auto-filled at preview time
                from the resolver. Fill these in only when the container is
                going somewhere different.
              </p>
              <div className={styles.fieldGrid}>
                <Field label="Recipient name on site">
                  <input
                    className={styles.input}
                    value={params.addr_name}
                    onChange={(e) => updateField('addr_name', e.target.value)}
                    placeholder="John Doe"
                  />
                </Field>
                <Field label="Street">
                  <input
                    className={styles.input}
                    value={params.addr_street}
                    onChange={(e) => updateField('addr_street', e.target.value)}
                    placeholder="418 Shoreline Dr"
                  />
                </Field>
                <Field label="City, State Zip" wide>
                  <input
                    className={styles.input}
                    value={params.addr_locality}
                    onChange={(e) => updateField('addr_locality', e.target.value)}
                    placeholder="Toms River, NJ 08753"
                  />
                </Field>
              </div>
            </div>

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
              Operator-entered details for the driver and receiver. All optional —
              anything left blank just won't appear on the sheet.
            </p>
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
              <Field label="Delivery company">
                <input
                  className={styles.input}
                  value={params.delivery_company}
                  onChange={(e) => updateField('delivery_company', e.target.value)}
                  placeholder="JT Hauling Co."
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
              <Field label="Door orientation">
                <input
                  className={styles.input}
                  value={params.door_orientation}
                  onChange={(e) => updateField('door_orientation', e.target.value)}
                  placeholder="Doors facing road"
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

          {/* Step 3 — Driver contact (optional) */}
          <FlowStep>
            <p className={styles.hint}>
              <strong>Optional.</strong> Capture the driver's contact info now
              and the Send-to-Driver button on the next page will be ready to
              go. Leave blank and you'll be prompted when you hit Send.
            </p>
            <p className={styles.hint}>
              <strong>SMS consent:</strong> capturing a phone number here does
              not authorize an SMS — the Send-to-Driver dialog walks you
              through the disclosure and the required attestation at the
              moment the message goes out. Full policy at{' '}
              <a href="/sms-terms" target="_blank" rel="noreferrer">
                /sms-terms
              </a>
              .
            </p>
            <div className={styles.fieldGrid}>
              <Field label="Driver name">
                <input
                  className={styles.input}
                  value={params.driver_name}
                  onChange={(e) => updateField('driver_name', e.target.value)}
                  placeholder="John Smith"
                />
              </Field>
              <Field
                label="Driver phone"
                hint="For SMS receipt — any US format works"
              >
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  className={styles.input}
                  value={params.driver_phone}
                  onChange={(e) => updateField('driver_phone', e.target.value)}
                  placeholder="(732) 555-0142"
                />
              </Field>
              <Field label="Driver email" wide hint="For email receipt — optional">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  className={styles.input}
                  value={params.driver_email}
                  onChange={(e) => updateField('driver_email', e.target.value)}
                  placeholder="driver@example.com"
                />
              </Field>
            </div>
          </FlowStep>

          {/* Step 4 — Preview */}
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

          {/* Step 5 — Done */}
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

      {step < 5 && (
        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            ← Back
          </Button>
          <div className={styles.actionsRight}>
            {step === 4 ? (
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
