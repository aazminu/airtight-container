import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Flow,
  FlowStep,
  Stepper,
} from '../components/ui';
import DeliveryTemplate from '../components/templates/delivery/DeliveryTemplate';
import type { DeliveryData } from '../components/templates/delivery/types';
import { SMS_CONSENT_VERSION } from '../lib/smsConsent';
import styles from './Outbound.module.css';

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

export default function Outbound() {
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
        throw new Error(body?.message ?? `HTTP ${res.status}`);
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
    <div className={styles.page}>
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
                  <input
                    type="tel"
                    inputMode="tel"
                    className={styles.input}
                    value={smsPhone}
                    onChange={(e) => setSmsPhone(e.target.value)}
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
    </div>
  );
}
