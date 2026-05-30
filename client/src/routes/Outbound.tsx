import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Flow,
  FlowStep,
  PhoneInput,
  Stepper,
} from '../components/ui';
import DeliveryTemplate from '../components/templates/delivery/DeliveryTemplate';
import type { DeliveryData } from '../components/templates/delivery/types';
import { SMS_CONSENT_VERSION } from '../lib/smsConsent';
import styles from './Outbound.module.css';

type OutboundKind = 'sales' | 'sh';

const KIND_STORAGE_KEY = 'outbound.kind';

// Top-level wrapper: tabbed router between sales (existing 4-step
// stepper) and Storage & Handling (new pickup-number flow). Deep link
// from Inventory: /outbound?sh_inventory_id=X defaults to the Storage
// & Handling tab with that box pre-selected on step 1.
export default function Outbound() {
  const [params] = useSearchParams();
  const deepLinkShId = params.get('sh_inventory_id');

  const [kind, setKind] = useState<OutboundKind>(() => {
    if (deepLinkShId) return 'sh';
    const v = localStorage.getItem(KIND_STORAGE_KEY);
    return v === 'sh' ? 'sh' : 'sales';
  });

  useEffect(() => {
    localStorage.setItem(KIND_STORAGE_KEY, kind);
  }, [kind]);

  return (
    <div className={styles.page}>
      <div className={styles.kindSegment} role="tablist" aria-label="Outbound kind">
        <button
          type="button"
          role="tab"
          aria-selected={kind === 'sales'}
          className={`${styles.kindTab} ${kind === 'sales' ? styles.kindActive : ''}`}
          onClick={() => setKind('sales')}
        >
          Sales
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === 'sh'}
          className={`${styles.kindTab} ${kind === 'sh' ? styles.kindActive : ''}`}
          onClick={() => setKind('sh')}
        >
          Storage &amp; Handling
        </button>
      </div>
      {kind === 'sales' ? (
        <SalesOutboundFlow />
      ) : (
        <ShOutboundFlow preselectId={deepLinkShId ? Number(deepLinkShId) : null} />
      )}
    </div>
  );
}

// Outbound stepper. The operator picks a scheduled delivery sheet,
// confirms its details (read-only — yard ops don't get to edit sheets),
// optionally captures the driver phone + sends an SMS receipt link,
// then marks the container picked up + prints the receipt. Printing
// the receipt is the only thing in the UI that flips sold → outbound.

interface ReportRow {
  id: number;
  report_type: string;
  delivery_sheet_number: string | null;
  parameters: ReportParameters | null;
  resolved_data: DeliveryData | null;
}

interface ReportParameters {
  container_id?: number;
  sh_box_id?: number;
  delivery_date?: string | null;
  onsite_contact?: string | null;
  door_orientation?: string | null;
  payment_details?: string | null;
  receipt_note?: string | null;
  notes?: string | null;
  driver_contact?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
}

interface ContainerRow {
  id: number;
  unit_number: string;
  size: string | null;
  state: 'pending' | 'available' | 'hold' | 'sold' | 'outbound';
  outbound_date: string | null;
  destination: string | null;
}

interface PendingPickup {
  id: number;
  delivery_sheet_number: string | null;
  parameters: ReportParameters;
  generated_at: string;
  container_id: number;
  unit_number: string;
  size: string | null;
  state: ContainerRow['state'];
  destination: string | null;
}

type StepId = 'pick' | 'confirm' | 'sms' | 'print';

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/New_York',
      });
};

// Accept anything 10/11-digit US or +<country><10+>. We don't normalize
// client-side (the server's toE164 handles that for Twilio); we just
// gate the Send button when the input clearly can't be a phone number.
const validPhone = (raw: string): boolean => {
  const t = raw.trim();
  if (!t) return false;
  if (t.startsWith('+') && t.replace(/\D/g, '').length >= 10) return true;
  const digits = t.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
};

const validEmail = (raw: string): boolean => {
  const t = raw.trim();
  return !t || /^\S+@\S+\.\S+$/.test(t);
};

function SalesOutboundFlow() {
  const { t } = useTranslation();
  const [smsEnabled, setSmsEnabled] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [container, setContainer] = useState<ContainerRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 0
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<PendingPickup[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);

  // Step 2 (Driver SMS) inputs
  const [smsName, setSmsName] = useState('');
  const [smsPhone, setSmsPhone] = useState('');
  const [smsEmail, setSmsEmail] = useState('');
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsSent, setSmsSent] = useState(false);

  // Step 3
  const [completing, setCompleting] = useState(false);

  // Step labels — drop the SMS step entirely when Twilio isn't
  // configured so the operator never sees a step they can't use.
  // FlowStep order in the JSX below must stay in sync with this array.
  const steps: { id: StepId; label: string }[] = (() => {
    const base: { id: StepId; label: string }[] = [
      { id: 'pick', label: t('outbound.steps.pick') },
      { id: 'confirm', label: t('outbound.steps.confirm') },
    ];
    if (smsEnabled) base.push({ id: 'sms', label: t('outbound.steps.sms') });
    base.push({ id: 'print', label: t('outbound.steps.print') });
    return base;
  })();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v2/report/config/sms', {
          credentials: 'include',
        });
        const body = await res.json().catch(() => null);
        setSmsEnabled(Boolean(body?.data?.enabled));
      } catch {
        setSmsEnabled(false);
      }
    })();
  }, []);

  const loadPending = async () => {
    try {
      const res = await fetch('/api/v2/report/pending-pickups', {
        credentials: 'include',
      });
      const body = await res.json().catch(() => null);
      if (res.ok) setPending(body?.data?.pending ?? []);
    } catch {
      // Non-fatal; search still works.
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    void loadPending();
  }, []);

  const loadFullReport = async (id: number): Promise<ReportRow | null> => {
    try {
      const res = await fetch(`/api/v2/report/${id}`, { credentials: 'include' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.message ?? `Something went wrong`);
      }
      return body?.data?.report as ReportRow;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('outbound.errors.load_failed'));
      return null;
    }
  };

  const loadContainerForReport = async (
    cid: number | undefined,
  ): Promise<ContainerRow | null> => {
    if (cid == null) return null;
    try {
      const res = await fetch('/api/v1/inventory', { credentials: 'include' });
      const body = await res.json().catch(() => null);
      const rows: ContainerRow[] = body?.data?.inventory ?? [];
      return rows.find((r) => r.id === cid) ?? null;
    } catch {
      return null;
    }
  };

  const seedSmsFromReport = (r: ReportRow | null) => {
    const dc = r?.parameters?.driver_contact;
    setSmsName(dc?.name ?? '');
    setSmsPhone(dc?.phone ?? '');
    setSmsEmail(dc?.email ?? '');
    setSmsSent(false);
  };

  const pickReport = async (id: number) => {
    setError(null);
    const full = await loadFullReport(id);
    if (!full) return;
    const cid = full.parameters?.container_id;
    const cont = await loadContainerForReport(cid);
    setReport(full);
    setContainer(cont);
    seedSmsFromReport(full);
    setStep(1);
  };

  const searchByNumber = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim().toUpperCase();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/report/by-number/${encodeURIComponent(q)}`,
        { credentials: 'include' },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.message ?? `Lookup failed (${res.status})`);
      }
      const r = body?.data?.report as ReportRow;
      const c = body?.data?.container as ContainerRow | null;
      setReport(r);
      setContainer(c);
      seedSmsFromReport(r);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('outbound.errors.lookup_failed'));
    } finally {
      setSearching(false);
    }
  };

  const resetToPick = () => {
    setReport(null);
    setContainer(null);
    setError(null);
    setSmsName('');
    setSmsPhone('');
    setSmsEmail('');
    setSmsSent(false);
    setStep(0);
    void loadPending();
  };

  const sendSms = async () => {
    if (!report) return;
    if (!validPhone(smsPhone)) {
      setError(t('outbound.sms.invalid_phone'));
      return;
    }
    if (!validEmail(smsEmail)) {
      setError(t('outbound.sms.invalid_email'));
      return;
    }
    setSmsBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/report/${report.id}/sms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: smsPhone.trim(),
          driver_contact: {
            name: smsName.trim(),
            phone: smsPhone.trim(),
            email: smsEmail.trim(),
          },
          // Auto-attest: operator is implicitly attesting by clicking
          // Send. Server records it on the report row.
          consent: { attested: true, text_version: SMS_CONSENT_VERSION },
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.message ?? `SMS failed (${res.status})`);
      }
      setSmsSent(true);
      // Refresh report so the resolved_data picks up the saved
      // driver_contact (the next-step receipt shows the driver name).
      const refreshed = await loadFullReport(report.id);
      if (refreshed) setReport(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('outbound.sms.failed'));
    } finally {
      setSmsBusy(false);
    }
  };

  const completePickup = async () => {
    if (!report) return;
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/report/${report.id}/complete-pickup`,
        { method: 'POST', credentials: 'include' },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.message ?? `Could not complete pickup (${res.status})`);
      }
      setContainer((prev) =>
        prev
          ? {
              ...prev,
              state: 'outbound',
              outbound_date: body.data?.outbound_date ?? new Date().toISOString(),
            }
          : prev,
      );
      setPending((prev) => prev.filter((r) => r.id !== report.id));
      window.open(`/reports/${report.id}/print`, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('outbound.print.failed'));
    } finally {
      setCompleting(false);
    }
  };

  const alreadyPickedUp = container?.state === 'outbound';
  const canPickUp = container?.state === 'sold';

  return (
    <>
      <header className={styles.header}>
        <h1>{t('outbound.title')}</h1>
        <p className={styles.sub}>{t('outbound.subtitle')}</p>
      </header>

      <Stepper
        labels={steps.map((s) => s.label)}
        current={step}
        ariaLabel={t('outbound.aria_progress')}
      />

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.body}>
        <Flow step={step}>
          {/* Pick sheet */}
          <FlowStep>
              <form className={styles.searchRow} onSubmit={searchByNumber}>
                <input
                  className={styles.search}
                  placeholder={t('outbound.pick.search_placeholder')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  spellCheck={false}
                />
                <Button type="submit" disabled={searching || !query.trim()}>
                  {searching ? t('outbound.pick.searching') : t('outbound.pick.search')}
                </Button>
              </form>

              <div className={styles.pendingHead}>
                <h2 className={styles.pendingTitle}>
                  {t('outbound.pick.pending_heading')}
                </h2>
                <span className={styles.pendingCount}>
                  {pendingLoading ? '…' : `${pending.length}`}
                </span>
              </div>
              {pendingLoading ? null : pending.length === 0 ? (
                <p className={styles.pendingEmpty}>
                  {t('outbound.pick.pending_empty')}
                </p>
              ) : (
                <div className={styles.pendingList}>
                  {pending.map((row) => {
                    const label = [
                      row.unit_number?.trim(),
                      row.size ? `· ${row.size}` : '',
                      row.destination ? `· ${row.destination}` : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <button
                        key={row.id}
                        type="button"
                        className={styles.pendingRow}
                        onClick={() => void pickReport(row.id)}
                      >
                        <span className={styles.pendingAt}>
                          {row.delivery_sheet_number ?? `#${row.id}`}
                        </span>
                        <span className={styles.pendingMeta}>{label || '—'}</span>
                        <span className={styles.pendingDate}>
                          {fmtDate(row.parameters?.delivery_date) === '—'
                            ? fmtDate(row.generated_at)
                            : fmtDate(row.parameters?.delivery_date)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </FlowStep>

          {/* Confirm — read-only preview */}
          <FlowStep>
              {report && (
                <>
                  <div className={styles.cardHead}>
                    <span className={styles.atNumber}>
                      {report.delivery_sheet_number ?? `#${report.id}`}
                    </span>
                    {container && (
                      <Badge tone={alreadyPickedUp ? 'success' : 'info'}>
                        {alreadyPickedUp
                          ? t('outbound.confirm.picked_up_badge')
                          : container.state}
                      </Badge>
                    )}
                  </div>
                  <p className={styles.note}>{t('outbound.confirm.note')}</p>
                  {report.resolved_data ? (
                    <div className={styles.previewWrap}>
                      <DeliveryTemplate data={report.resolved_data} />
                    </div>
                  ) : (
                    <p className={styles.note}>
                      {t('outbound.confirm.resolved_missing')}
                    </p>
                  )}
                </>
              )}
            </FlowStep>

          {/* Driver SMS — omitted when SMS isn't configured */}
          {smsEnabled && (
            <FlowStep>
              <p className={styles.note}>{t('outbound.sms.note')}</p>
              <div className={styles.smsGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>{t('outbound.sms.name_label')}</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={smsName}
                    onChange={(e) => setSmsName(e.target.value)}
                    placeholder={t('outbound.sms.name_placeholder')}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>{t('outbound.sms.phone_label')}</span>
                  <PhoneInput
                    className={styles.input}
                    value={smsPhone}
                    onChange={setSmsPhone}
                    placeholder={t('outbound.sms.phone_placeholder')}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>{t('outbound.sms.email_label')}</span>
                  <input
                    type="email"
                    inputMode="email"
                    className={styles.input}
                    value={smsEmail}
                    onChange={(e) => setSmsEmail(e.target.value)}
                    placeholder={t('outbound.sms.email_placeholder')}
                  />
                </label>
              </div>
              {smsSent && (
                <p className={styles.success}>{t('outbound.sms.sent')}</p>
              )}
              <div className={styles.actions}>
                <Button
                  onClick={sendSms}
                  disabled={
                    smsBusy || !validPhone(smsPhone) || !validEmail(smsEmail)
                  }
                >
                  {smsBusy
                    ? t('outbound.sms.sending')
                    : smsSent
                      ? t('outbound.sms.resend')
                      : t('outbound.sms.send')}
                </Button>
              </div>
            </FlowStep>
          )}

          {/* Mark outbound + print */}
          <FlowStep>
              {report && (
                <>
                  {alreadyPickedUp ? (
                    <>
                      <p className={styles.success}>
                        {container?.outbound_date
                          ? t('outbound.print.already_marked_with_date', {
                              date: fmtDate(container.outbound_date),
                            })
                          : t('outbound.print.already_marked')}
                      </p>
                      <div className={styles.actions}>
                        <a
                          className={styles.linkBtn}
                          href={`/reports/${report.id}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('outbound.print.reprint')}
                        </a>
                        <Button variant="secondary" onClick={resetToPick}>
                          {t('outbound.print.start_another')}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className={styles.bigActionRow}>
                      <button
                        type="button"
                        className={styles.bigPrimary}
                        onClick={completePickup}
                        disabled={!canPickUp || completing}
                      >
                        {completing
                          ? t('outbound.print.marking')
                          : t('outbound.print.primary_button')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </FlowStep>
        </Flow>
      </div>

      {step > 0 && (
        <div className={styles.stepNav}>
          <Button
            variant="secondary"
            onClick={() => {
              if (step === 1) {
                resetToPick();
              } else {
                setStep((s) => Math.max(0, s - 1));
              }
            }}
          >
            {t('outbound.nav.back')}
          </Button>
          {step < steps.length - 1 && (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!report}>
              {t('outbound.nav.next')}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

// ---- Storage & Handling outbound flow ------------------------------

interface ShBox {
  id: number;
  client_id: number | null;
  client_name: string | null;
  business_name: string | null;
  unit_number: string;
  size: string;
  damage: string | null;
  intake_date: string;
  state: 'pending' | 'in_storage' | 'checked_out';
}

interface PickupOption {
  pickup_number_id: number;
  pickup_number_value: string;
  pickup_count: number;
  assignment_count: number;
  sale_company_id: number;
  sale_company_name: string;
}

type ShStepId = 'select' | 'review' | 'print';

function customerLabel(box: ShBox): string {
  if (box.client_id == null) return 'Unassigned';
  if (box.business_name && box.client_name) {
    return `${box.client_name} — ${box.business_name}`;
  }
  return box.client_name ?? `Client #${box.client_id}`;
}

function isoToLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ShOutboundFlow({ preselectId }: { preselectId: number | null }) {
  const navigate = useNavigate();
  const [boxes, setBoxes] = useState<ShBox[]>([]);
  const [boxesLoading, setBoxesLoading] = useState(true);
  const [boxesError, setBoxesError] = useState<string | null>(null);

  const [pickups, setPickups] = useState<PickupOption[]>([]);
  const [pickupsError, setPickupsError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  // Single-box flow — operator outbounds one box per run and re-runs
  // for batches. Cuts UI complexity and keeps the Next button visible
  // regardless of fleet size.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pickupId, setPickupId] = useState<number | null>(null);
  const [damage, setDamage] = useState('');
  const [outboundDate, setOutboundDate] = useState(() => isoToLocalInput(new Date()));

  const [step, setStep] = useState<ShStepId>('select');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitFieldError, setSubmitFieldError] = useState<{
    code: string;
    details?: Record<string, unknown>;
  } | null>(null);
  const [printedId, setPrintedId] = useState<number | null>(null);

  // Preselect from deep-link once boxes have loaded.
  const preselectApplied = useRef(false);
  useEffect(() => {
    if (preselectApplied.current) return;
    if (boxesLoading) return;
    if (preselectId == null) return;
    if (boxes.some((b) => b.id === preselectId)) {
      setSelectedId(preselectId);
    }
    preselectApplied.current = true;
  }, [preselectId, boxes, boxesLoading]);

  // Load in_storage boxes.
  useEffect(() => {
    let cancelled = false;
    setBoxesLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/v2/sh-inventory?state=in_storage', {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Something went wrong');
        const body = (await res.json()) as { data: { boxes: ShBox[] } };
        if (cancelled) return;
        setBoxes(body.data.boxes);
      } catch (e) {
        if (!cancelled)
          setBoxesError(e instanceof Error ? e.message : 'Failed to load boxes');
      } finally {
        if (!cancelled) setBoxesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load active pickup numbers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/pickup/numbers', { credentials: 'include' });
        if (!res.ok) throw new Error('Something went wrong');
        const body = (await res.json()) as { data: { pickups: PickupOption[] } };
        if (cancelled) return;
        setPickups(body.data.pickups);
      } catch (e) {
        if (!cancelled)
          setPickupsError(
            e instanceof Error ? e.message : 'Failed to load pickup numbers',
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredBoxes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return boxes;
    return boxes.filter((b) =>
      [b.unit_number, b.client_name, b.business_name, b.size]
        .filter((v): v is string => !!v)
        .some((v) => v.toLowerCase().includes(q)),
    );
  }, [boxes, search]);

  const selectedBox = boxes.find((b) => b.id === selectedId) ?? null;

  const pickupGroups = useMemo(() => {
    const groups = new Map<number, { name: string; items: PickupOption[] }>();
    for (const p of pickups) {
      if (!groups.has(p.sale_company_id)) {
        groups.set(p.sale_company_id, { name: p.sale_company_name, items: [] });
      }
      groups.get(p.sale_company_id)!.items.push(p);
    }
    return [...groups.values()];
  }, [pickups]);

  const selectedPickup = pickups.find((p) => p.pickup_number_id === pickupId) ?? null;
  const remainingSlots = selectedPickup
    ? Math.max(0, selectedPickup.pickup_count - selectedPickup.assignment_count)
    : null;

  const canSubmit =
    selectedBox != null &&
    pickupId != null &&
    !!outboundDate &&
    !submitting &&
    (remainingSlots == null || remainingSlots >= 1);

  const submit = async () => {
    if (!canSubmit || !selectedBox) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitFieldError(null);
    try {
      const isoDate = new Date(outboundDate).toISOString();
      const res = await fetch('/api/v2/sh-inventory/outbound', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup_number_id: pickupId,
          outbound_date: isoDate,
          boxes: [
            {
              sh_inventory_id: selectedBox.id,
              pickup_damage: damage.trim() || 'Out good',
            },
          ],
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
        data?: { receipt_box_ids: number[] };
      } | null;
      if (!res.ok) {
        if (body?.code) {
          setSubmitFieldError({ code: body.code, details: body.details });
        }
        throw new Error(body?.message ?? 'Outbound failed');
      }
      const ids = body?.data?.receipt_box_ids ?? [selectedBox.id];
      setPrintedId(ids[0] ?? selectedBox.id);
      setStep('print');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Outbound failed');
    } finally {
      setSubmitting(false);
    }
  };

  const goToReview = () => {
    if (selectedId == null) return;
    setStep('review');
  };

  const resetForAnother = () => {
    setSelectedId(null);
    setDamage('');
    setSubmitError(null);
    setSubmitFieldError(null);
    setPrintedId(null);
    setStep('select');
    // Refetch in case the in-storage list changed under us.
    (async () => {
      try {
        const res = await fetch('/api/v2/sh-inventory?state=in_storage', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const body = (await res.json()) as { data: { boxes: ShBox[] } };
        setBoxes(body.data.boxes);
        const pickupRes = await fetch('/api/v2/pickup/numbers', { credentials: 'include' });
        if (!pickupRes.ok) return;
        const pickupBody = (await pickupRes.json()) as { data: { pickups: PickupOption[] } };
        setPickups(pickupBody.data.pickups);
      } catch {
        // non-fatal
      }
    })();
  };

  const steps: { id: ShStepId; label: string }[] = [
    { id: 'select', label: 'Pick a box' },
    { id: 'review', label: 'Pickup & damage' },
    { id: 'print', label: 'Print' },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <>
      <header className={styles.header}>
        <h1>Storage &amp; Handling Outbound</h1>
        <p className={styles.sub}>
          Pick a box, assign a pickup number, and print the receipt.
        </p>
      </header>

      <Stepper labels={steps.map((s) => s.label)} current={stepIndex} />

      <Flow step={stepIndex}>
        <FlowStep>
          <section className={styles.stepBody}>
            {boxesError && <div className={styles.error}>{boxesError}</div>}
            <input
              type="search"
              className={styles.search}
              placeholder="Search unit #, customer, size…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className={styles.selectCount}>
              {selectedId != null ? '1 selected' : 'None selected'} ·{' '}
              {filteredBoxes.length} on site
            </div>
            <div className={styles.boxList}>
              {boxesLoading ? (
                <p>Loading…</p>
              ) : filteredBoxes.length === 0 ? (
                <p className={styles.muted}>No boxes on site match.</p>
              ) : (
                filteredBoxes.map((b) => {
                  const checked = selectedId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className={styles.boxRow}
                      data-checked={checked}
                      onClick={() => setSelectedId(b.id)}
                    >
                      <div className={styles.boxMain}>
                        <div className={styles.boxUnit}>{b.unit_number.trim()}</div>
                        <div className={styles.boxMeta}>
                          {customerLabel(b)} · {b.size}
                          {b.damage ? ` · ${b.damage}` : ''}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className={styles.nav}>
              <Button
                variant="primary"
                onClick={goToReview}
                disabled={selectedId == null}
              >
                Next
              </Button>
            </div>
          </section>
        </FlowStep>

        <FlowStep>
          <section className={styles.stepBody}>
            {pickupsError && <div className={styles.error}>{pickupsError}</div>}

            {selectedBox && (
              <div className={styles.boxRow} data-checked>
                <div className={styles.boxMain}>
                  <div className={styles.boxUnit}>
                    {selectedBox.unit_number.trim()}
                  </div>
                  <div className={styles.boxMeta}>
                    {customerLabel(selectedBox)} · {selectedBox.size}
                  </div>
                </div>
              </div>
            )}

            <label className={styles.fieldLabel}>Pickup number</label>
            <select
              className={styles.formInput}
              value={pickupId ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setPickupId(v ? Number(v) : null);
                setSubmitFieldError(null);
              }}
            >
              <option value="" disabled>
                Pick a pickup number
              </option>
              {pickupGroups.map((g, i) => (
                <optgroup key={i} label={g.name}>
                  {g.items.map((p) => {
                    const remaining = p.pickup_count - p.assignment_count;
                    return (
                      <option
                        key={p.pickup_number_id}
                        value={p.pickup_number_id}
                        disabled={remaining <= 0}
                      >
                        {p.pickup_number_value} — {remaining} of {p.pickup_count} left
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>

            {selectedPickup && remainingSlots != null && remainingSlots < 1 && (
              <div className={styles.error}>
                This pickup has no remaining slots.
              </div>
            )}

            <label className={styles.fieldLabel}>Outbound date</label>
            <input
              type="datetime-local"
              className={styles.formInput}
              value={outboundDate}
              onChange={(e) => setOutboundDate(e.target.value)}
            />

            <label className={styles.fieldLabel}>Damage at pickup</label>
            <input
              type="text"
              className={styles.formInput}
              value={damage}
              placeholder="Out good"
              onChange={(e) => setDamage(e.target.value)}
            />

            {submitFieldError?.code === 'box_not_in_storage' && (
              <div className={styles.error}>
                This box isn't in storage anymore — refresh the list and try
                again.
              </div>
            )}
            {submitError && <div className={styles.error}>{submitError}</div>}

            <div className={styles.nav}>
              <Button variant="ghost" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button variant="primary" onClick={submit} disabled={!canSubmit}>
                {submitting ? 'Saving…' : 'Outbound'}
              </Button>
            </div>
          </section>
        </FlowStep>

        <FlowStep>
          <section className={styles.stepBody}>
            <p>
              <Badge tone="success">Done</Badge> Box checked out.
            </p>
            <div className={styles.nav}>
              <Button
                variant="primary"
                onClick={() => {
                  if (printedId == null) return;
                  window.open(`/sh-pickup-receipt/${printedId}`, '_blank');
                }}
                disabled={printedId == null}
              >
                Print receipt
              </Button>
              <Button variant="secondary" onClick={resetForAnother}>
                Outbound another box
              </Button>
              <Button variant="ghost" onClick={() => navigate('/inventory')}>
                Back to Inventory
              </Button>
            </div>
          </section>
        </FlowStep>
      </Flow>
    </>
  );
}
