import { useEffect, useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Flow,
  FlowStep,
  Stepper,
} from '../components/ui';
import { SendSmsDialog } from '../components/forms/SendSmsDialog';
import type { SendSmsResult } from '../components/forms/SendSmsDialog';
import {
  EditDeliverySheetDialog,
  type DeliverySheetParameters,
} from '../components/forms/EditDeliverySheetDialog';
import DeliveryTemplate from '../components/templates/delivery/DeliveryTemplate';
import type { DeliveryData } from '../components/templates/delivery/types';
import styles from './Outbound.module.css';

// Outbound stepper. The operator picks a scheduled delivery sheet,
// confirms its details (with an Edit affordance), captures the driver
// SMS, and finishes by printing the receipt — which is the moment the
// container flips sold → outbound (sold.outbound_date = now). No other
// UI action triggers that flip; this is the source of truth.

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
  delivery_company?: string | null;
  onsite_contact?: string | null;
  door_orientation?: string | null;
  payment_details?: string | null;
  receipt_note?: string | null;
  receipt_summary?: string | null;
  notes?: string | null;
  driver_contact?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  delivery_address?: unknown;
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

const STEP_NAMES = ['Pick sheet', 'Confirm', 'Driver SMS', 'Print receipt'] as const;

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

export default function Outbound() {
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [container, setContainer] = useState<ContainerRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 0 state
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<PendingPickup[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);

  // Step 1 state
  const [editOpen, setEditOpen] = useState(false);

  // Step 2 state
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [smsBusy, setSmsBusy] = useState(false);

  // Step 3 state
  const [completing, setCompleting] = useState(false);

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
      setError(e instanceof Error ? e.message : 'Failed to load sheet');
      return null;
    }
  };

  const loadContainerForReport = async (
    cid: number | undefined,
  ): Promise<ContainerRow | null> => {
    if (cid == null) return null;
    try {
      const res = await fetch(`/api/v1/inventory`, { credentials: 'include' });
      const body = await res.json().catch(() => null);
      const rows: ContainerRow[] = body?.data?.inventory ?? [];
      const inv = rows.find((r) => r.id === cid);
      if (!inv) return null;
      // /api/v1/inventory rows lack destination + outbound_date; for the
      // current state check the inventory row is enough. The Confirm
      // step shows what it has; missing dest renders "—".
      return inv;
    } catch {
      return null;
    }
  };

  const pickReport = async (id: number) => {
    setError(null);
    const full = await loadFullReport(id);
    if (!full) return;
    const cid = full.parameters?.container_id;
    const cont = await loadContainerForReport(cid);
    setReport(full);
    setContainer(cont);
    setSmsSent(false);
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
      setSmsSent(false);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setSearching(false);
    }
  };

  const resetToPick = () => {
    setReport(null);
    setContainer(null);
    setError(null);
    setSmsSent(false);
    setStep(0);
    void loadPending();
  };

  const sendSms = async (result: SendSmsResult) => {
    if (!report) return;
    setSmsOpen(false);
    setSmsBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/report/${report.id}/sms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: result.to, consent: result.consent }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.message ?? `SMS failed (${res.status})`);
      }
      setSmsSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'SMS send failed');
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
      setError(err instanceof Error ? err.message : 'Could not complete pickup');
    } finally {
      setCompleting(false);
    }
  };

  const params = report?.parameters ?? {};
  const driverPhone = params.driver_contact?.phone ?? '';
  const driverName = params.driver_contact?.name ?? null;
  const alreadyPickedUp = container?.state === 'outbound';
  const canPickUp = container?.state === 'sold';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Outbound</h1>
        <p className={styles.sub}>
          Pick a scheduled delivery sheet, confirm the details, capture the
          driver SMS, and print the receipt. Printing the receipt is what
          marks the container picked up.
        </p>
      </header>

      <Stepper
        labels={STEP_NAMES}
        current={step}
        ariaLabel="Outbound flow progress"
      />

      {error && <div className={styles.error}>{error}</div>}

      <Flow step={step}>
        {/* Step 0 — Pick sheet */}
        <FlowStep>
          <form className={styles.searchRow} onSubmit={searchByNumber}>
            <input
              className={styles.search}
              placeholder="AT number, e.g. AT202605001"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              spellCheck={false}
            />
            <Button type="submit" disabled={searching || !query.trim()}>
              {searching ? 'Searching…' : 'Search'}
            </Button>
          </form>

          <div className={styles.pendingHead}>
            <h2 className={styles.pendingTitle}>Pending pickups</h2>
            <span className={styles.pendingCount}>
              {pendingLoading ? '…' : `${pending.length}`}
            </span>
          </div>
          {pendingLoading ? null : pending.length === 0 ? (
            <p className={styles.pendingEmpty}>
              No delivery sheets are waiting for pickup.
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

        {/* Step 1 — Confirm */}
        <FlowStep>
          {report && (
            <>
              <div className={styles.cardHead}>
                <span className={styles.atNumber}>
                  {report.delivery_sheet_number ?? `#${report.id}`}
                </span>
                {container && (
                  <Badge tone={alreadyPickedUp ? 'success' : 'info'}>
                    {alreadyPickedUp ? 'Picked up' : container.state}
                  </Badge>
                )}
              </div>
              {alreadyPickedUp && (
                <p className={styles.note}>
                  This box has already been picked up
                  {container?.outbound_date
                    ? ` on ${fmtDate(container.outbound_date)}`
                    : ''}
                  . Re-print the receipt below if needed.
                </p>
              )}
              {report.resolved_data ? (
                <div className={styles.previewWrap}>
                  <DeliveryTemplate data={report.resolved_data} />
                </div>
              ) : (
                <p className={styles.note}>
                  Resolved data is missing on this sheet.
                </p>
              )}
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  onClick={() => setEditOpen(true)}
                >
                  Edit details
                </Button>
              </div>
            </>
          )}
        </FlowStep>

        {/* Step 2 — Driver SMS */}
        <FlowStep>
          {report && (
            <>
              <p className={styles.note}>
                Send the driver an SMS with the receipt link. The send-SMS
                dialog walks you through the A2P 10DLC consent disclosure
                and captures attestation before the message goes out.
              </p>
              <dl className={styles.details}>
                <div>
                  <dt>Driver</dt>
                  <dd>{driverName ?? '—'}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{driverPhone || '—'}</dd>
                </div>
              </dl>
              {smsSent && (
                <p className={styles.success}>
                  SMS sent. You can re-send if needed.
                </p>
              )}
              <div className={styles.actions}>
                <Button
                  onClick={() => setSmsOpen(true)}
                  disabled={smsBusy || !report.resolved_data}
                >
                  {smsSent ? 'Re-send SMS…' : 'Send SMS…'}
                </Button>
                {!driverPhone && (
                  <Button variant="secondary" onClick={() => setEditOpen(true)}>
                    Edit driver info
                  </Button>
                )}
              </div>
            </>
          )}
        </FlowStep>

        {/* Step 3 — Print receipt */}
        <FlowStep>
          {report && (
            <>
              <p className={styles.note}>
                Hitting <strong>Mark picked up &amp; print receipt</strong> is
                what stamps the outbound date and flips the container to{' '}
                <em>outbound</em>. The receipt opens in a new tab and prints.
              </p>
              {alreadyPickedUp ? (
                <p className={styles.note}>
                  Already marked picked up
                  {container?.outbound_date
                    ? ` (${fmtDate(container.outbound_date)})`
                    : ''}
                  .
                </p>
              ) : (
                <div className={styles.actions}>
                  <Button
                    onClick={completePickup}
                    disabled={!canPickUp || completing}
                  >
                    {completing
                      ? 'Marking…'
                      : 'Mark picked up & print receipt'}
                  </Button>
                </div>
              )}
              {alreadyPickedUp && (
                <div className={styles.actions}>
                  <a
                    className={styles.linkBtn}
                    href={`/reports/${report.id}/print`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Re-print receipt →
                  </a>
                  <Button variant="secondary" onClick={resetToPick}>
                    Start another pickup
                  </Button>
                </div>
              )}
            </>
          )}
        </FlowStep>
      </Flow>

      {/* Step navigation */}
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
            ← Back
          </Button>
          {step < STEP_NAMES.length - 1 && (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!report}>
              Next →
            </Button>
          )}
        </div>
      )}

      {/* Modals */}
      {report?.report_type === 'delivery_sheet' && (
        <EditDeliverySheetDialog
          open={editOpen}
          reportId={report.id}
          initial={(report.parameters ?? {}) as DeliverySheetParameters}
          onCancel={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            const refreshed = await loadFullReport(report.id);
            if (refreshed) setReport(refreshed);
          }}
        />
      )}
      {report?.report_type === 'delivery_sheet' && (
        <SendSmsDialog
          open={smsOpen}
          defaultPhone={driverPhone}
          driverName={driverName}
          onCancel={() => setSmsOpen(false)}
          onConfirm={sendSms}
        />
      )}
    </div>
  );
}
