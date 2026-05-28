import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button } from '../components/ui';
import styles from './Outbound.module.css';

// Outbound flow: the operator searches a scheduled delivery sheet by its
// AT number, confirms the details, and marks the container picked up —
// which prints the receipt and stamps sold.outbound_date = now. This is
// the authoritative outbound event (the date-based auto-flip cron is only
// a fallback). Driver SMS lives on the delivery-sheet detail page, which
// already carries the A2P consent machinery — we link out to it.

interface ReportRow {
  id: number;
  delivery_sheet_number: string | null;
  parameters: {
    container_id?: number;
    delivery_date?: string | null;
    delivery_company?: string | null;
    onsite_contact?: string | null;
    door_orientation?: string | null;
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

interface LookupResult {
  report: ReportRow;
  container: ContainerRow | null;
}

interface PendingPickup {
  id: number;
  delivery_sheet_number: string | null;
  parameters: ReportRow['parameters'];
  generated_at: string;
  container_id: number;
  unit_number: string;
  size: string | null;
  state: ContainerRow['state'];
  destination: string | null;
}

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
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [completing, setCompleting] = useState(false);
  const [pending, setPending] = useState<PendingPickup[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);

  const loadPending = async () => {
    try {
      const res = await fetch('/api/v2/report/pending-pickups', {
        credentials: 'include',
      });
      const body = await res.json().catch(() => null);
      if (res.ok) setPending(body?.data?.pending ?? []);
    } catch {
      // Non-fatal; the search box still works.
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    void loadPending();
  }, []);

  const pickPending = (row: PendingPickup) => {
    setError(null);
    setResult({
      report: {
        id: row.id,
        delivery_sheet_number: row.delivery_sheet_number,
        parameters: row.parameters,
      },
      container: {
        id: row.container_id,
        unit_number: row.unit_number,
        size: row.size,
        state: row.state,
        outbound_date: null,
        destination: row.destination,
      },
    });
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim().toUpperCase();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/v2/report/by-number/${encodeURIComponent(q)}`,
        { credentials: 'include' },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.message ?? `Lookup failed (${res.status})`);
      }
      setResult(body.data as LookupResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const completePickup = async () => {
    if (!result) return;
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/report/${result.report.id}/complete-pickup`,
        { method: 'POST', credentials: 'include' },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.message ?? `Could not complete pickup (${res.status})`);
      }
      // Reflect the new state locally, then open the printable receipt.
      setResult((prev) =>
        prev && prev.container
          ? {
              ...prev,
              container: {
                ...prev.container,
                state: 'outbound',
                outbound_date: body.data?.outbound_date ?? new Date().toISOString(),
              },
            }
          : prev,
      );
      // Drop the now-completed sheet from the pending list.
      setPending((prev) => prev.filter((r) => r.id !== result.report.id));
      window.open(`/reports/${result.report.id}/print`, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete pickup');
    } finally {
      setCompleting(false);
    }
  };

  const report = result?.report;
  const container = result?.container;
  const params = report?.parameters ?? {};

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Outbound</h1>
        <p className={styles.sub}>
          Find a scheduled delivery sheet by its AT number, confirm the
          details, and mark the container picked up.
        </p>
      </header>

      <form className={styles.searchRow} onSubmit={search}>
        <input
          className={styles.search}
          placeholder="AT number, e.g. AT202605001"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          spellCheck={false}
        />
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {error && <div className={styles.error}>{error}</div>}

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
            const selected = report?.id === row.id;
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
                className={`${styles.pendingRow} ${selected ? styles.selected : ''}`}
                onClick={() => pickPending(row)}
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

      {report && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.atNumber}>{report.delivery_sheet_number}</span>
            {container && (
              <Badge tone={container.state === 'outbound' ? 'success' : 'info'}>
                {container.state === 'outbound' ? 'Picked up' : container.state}
              </Badge>
            )}
          </div>

          {!container ? (
            <p className={styles.note}>
              This delivery sheet isn’t linked to a sales container (S&amp;H
              box deliveries are handled from the S&amp;H screens).
            </p>
          ) : (
            <dl className={styles.details}>
              <div>
                <dt>Container</dt>
                <dd>
                  {container.unit_number.trim()}
                  {container.size ? ` · ${container.size}` : ''}
                </dd>
              </div>
              <div>
                <dt>Destination</dt>
                <dd>{container.destination || '—'}</dd>
              </div>
              <div>
                <dt>Scheduled</dt>
                <dd>{fmtDate(params.delivery_date)}</dd>
              </div>
              <div>
                <dt>Trucking co.</dt>
                <dd>{params.delivery_company || '—'}</dd>
              </div>
              <div>
                <dt>On-site contact</dt>
                <dd>{params.onsite_contact || '—'}</dd>
              </div>
              <div>
                <dt>Door orientation</dt>
                <dd>{params.door_orientation || '—'}</dd>
              </div>
              {container.state === 'outbound' && (
                <div>
                  <dt>Picked up</dt>
                  <dd>{fmtDate(container.outbound_date)}</dd>
                </div>
              )}
            </dl>
          )}

          <div className={styles.actions}>
            {container?.state === 'sold' && (
              <Button type="button" onClick={completePickup} disabled={completing}>
                {completing ? 'Marking…' : 'Mark picked up & print receipt'}
              </Button>
            )}
            {container?.state === 'outbound' && (
              <a
                className={styles.linkBtn}
                href={`/reports/${report.id}/print`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Reprint receipt →
              </a>
            )}
            <a className={styles.linkBtn} href={`/reports/${report.id}`}>
              Open delivery sheet (send to driver, edit) →
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
