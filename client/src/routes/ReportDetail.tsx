import { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DeliveryTemplate from '../components/templates/delivery/DeliveryTemplate';
import IOReportTemplate from '../components/templates/io-report/IOReportTemplate';
import PnLTemplate from '../components/templates/pnl/PnLTemplate';
import ReleaseSummaryTemplate from '../components/templates/release-summary/ReleaseSummaryTemplate';
import ShStatementTemplate from '../components/templates/sh-statement/ShStatementTemplate';
import type { DeliveryData } from '../components/templates/delivery/types';
import type { IOReportData } from '../components/templates/io-report/types';
import type { PnLData } from '../components/templates/pnl/types';
import type { ReleaseSummaryData } from '../components/templates/release-summary/types';
import type { ShStatementData } from '../components/templates/sh-statement/types';
import { Badge } from '../components/ui';
import { userContext } from '../context/restaurantcontext';
import styles from './ReportDetail.module.css';

type ReportType =
  | 'delivery_sheet'
  | 'io_report'
  | 'pnl'
  | 'sh_statement'
  | 'release_summary';

interface ReportRow {
  id: number;
  report_type: ReportType;
  generated_at: string;
  generated_by: string | null;
  parameters: Record<string, unknown> | null;
  resolved_data: Record<string, unknown> | null;
  pdf_s3_key: string | null;
  pdf_generated_at: string | null;
  emailed_to: string[] | null;
  emailed_at: string | null;
}

interface ApiResponse {
  status: string;
  data: { report: ReportRow };
}

const TYPE_LABELS: Record<ReportType, string> = {
  delivery_sheet: 'Delivery sheet',
  io_report: 'In / Out report',
  pnl: 'Profit + Loss',
  sh_statement: 'S&H statement',
  release_summary: 'Release summary',
};

type ActionState =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'ok'; message: string }
  | { kind: 'err'; message: string };

const fmtDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useContext(userContext) as {
    user?: { permissions?: string };
  };
  const isAdmin = user?.permissions === 'admin';
  const [report, setReport] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/report/${id}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as ApiResponse;
      setReport(body.data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRegenerateData = async () => {
    if (!report) return;
    setAction({ kind: 'busy', label: 'Re-running resolver…' });
    try {
      const res = await fetch(`/api/v2/report/${report.id}/regenerate`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setAction({ kind: 'ok', message: 'Resolver re-run; PDF cleared.' });
      await load();
    } catch (e) {
      setAction({
        kind: 'err',
        message: e instanceof Error ? e.message : 'Regenerate failed',
      });
    }
  };

  const handleRegeneratePdf = async () => {
    if (!report) return;
    setAction({ kind: 'busy', label: 'Rendering PDF…' });
    try {
      const res = await fetch(`/api/v2/report/${report.id}/pdf`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setAction({ kind: 'ok', message: 'PDF rendered.' });
      await load();
    } catch (e) {
      setAction({
        kind: 'err',
        message: e instanceof Error ? e.message : 'PDF render failed',
      });
    }
  };

  const handleOpenPdf = () => {
    if (!report) return;
    window.open(`/api/v2/report/${report.id}/pdf`, '_blank');
  };

  const handleEmail = async () => {
    if (!report) return;
    const fallback =
      (report.resolved_data as { customer?: { contact_email?: string } })
        ?.customer?.contact_email ??
      (report.resolved_data as { client?: { contact_email?: string } })?.client
        ?.contact_email ??
      '';
    const to = window.prompt(
      'Send to (comma-separated for multiple):',
      fallback,
    );
    if (to === null) return;
    const list = to
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) {
      setAction({ kind: 'err', message: 'No recipient given.' });
      return;
    }
    setAction({ kind: 'busy', label: 'Sending…' });
    try {
      const res = await fetch(`/api/v2/report/${report.id}/email`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: list }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setAction({ kind: 'ok', message: `Sent to ${list.join(', ')}.` });
      await load();
    } catch (e) {
      setAction({
        kind: 'err',
        message: e instanceof Error ? e.message : 'Email failed',
      });
    }
  };

  const handleDelete = async () => {
    if (!report) return;
    const ok = window.confirm(
      `Delete report #${report.id}? The row and the stored PDF will both be removed. This cannot be undone.`,
    );
    if (!ok) return;
    setAction({ kind: 'busy', label: 'Deleting…' });
    try {
      const res = await fetch(`/api/v2/report/${report.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      navigate('/reports');
    } catch (e) {
      setAction({
        kind: 'err',
        message: e instanceof Error ? e.message : 'Delete failed',
      });
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading report…</div>
      </div>
    );
  }
  if (error || !report) {
    return (
      <div className={styles.page}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('/reports')}
        >
          ← Back to reports
        </button>
        <div className={styles.error}>{error ?? 'Report not found'}</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.back}
        onClick={() => navigate('/reports')}
      >
        ← Back to reports
      </button>

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {TYPE_LABELS[report.report_type]} · #{report.id}
          </h1>
          <p className={styles.subtitle}>
            Generated {fmtDateTime(report.generated_at)}
            {report.generated_by ? ` · by ${report.generated_by}` : ''}
          </p>
        </div>
        <div className={styles.headerFlags}>
          <Badge tone={report.pdf_s3_key ? 'success' : 'neutral'}>
            {report.pdf_s3_key ? 'PDF ready' : 'No PDF'}
          </Badge>
          <Badge tone={report.emailed_at ? 'success' : 'neutral'}>
            {report.emailed_at ? 'Sent' : 'Unsent'}
          </Badge>
        </div>
      </header>

      {action.kind === 'busy' && (
        <div className={styles.toast}>{action.label}</div>
      )}
      {action.kind === 'ok' && (
        <div className={`${styles.toast} ${styles.toastOk}`}>
          {action.message}
        </div>
      )}
      {action.kind === 'err' && (
        <div className={`${styles.toast} ${styles.toastErr}`}>
          {action.message}
        </div>
      )}

      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.btn}
          onClick={handleOpenPdf}
          disabled={!report.resolved_data}
        >
          Open PDF
        </button>
        {isAdmin && (
          <>
            <button
              type="button"
              className={styles.btn}
              onClick={handleRegeneratePdf}
              disabled={!report.resolved_data}
            >
              Re-render PDF
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={handleRegenerateData}
            >
              Re-resolve data
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={handleEmail}
              disabled={!report.resolved_data}
            >
              Email…
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={handleDelete}
            >
              Delete
            </button>
          </>
        )}
      </div>

      {(report.emailed_to?.length ?? 0) > 0 && (
        <div className={styles.metaBlock}>
          <span className={styles.metaLabel}>Recipients:</span>{' '}
          {report.emailed_to?.join(', ')}
          {report.emailed_at ? ` · last sent ${fmtDateTime(report.emailed_at)}` : ''}
        </div>
      )}

      <div className={styles.preview}>
        <div className={styles.previewInner}>
          <ReportInline row={report} />
        </div>
      </div>
    </div>
  );
}

function ReportInline({ row }: { row: ReportRow }) {
  if (!row.resolved_data) {
    return (
      <div className={styles.placeholder}>
        Resolver data is missing. Click "Re-resolve data" to populate.
      </div>
    );
  }
  switch (row.report_type) {
    case 'delivery_sheet':
      return <DeliveryTemplate data={row.resolved_data as unknown as DeliveryData} />;
    case 'io_report':
      return <IOReportTemplate data={row.resolved_data as unknown as IOReportData} />;
    case 'pnl':
      return <PnLTemplate data={row.resolved_data as unknown as PnLData} />;
    case 'sh_statement':
      return <ShStatementTemplate data={row.resolved_data as unknown as ShStatementData} />;
    case 'release_summary':
      return (
        <ReleaseSummaryTemplate
          data={row.resolved_data as unknown as ReleaseSummaryData}
        />
      );
  }
}
