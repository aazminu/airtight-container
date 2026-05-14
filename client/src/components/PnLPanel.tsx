import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PnLData } from './templates/pnl/types';
import styles from './PnLPanel.module.css';

// Live P&L panel on the dashboard. Hits GET /api/v2/pnl on every
// granularity/period change; the resolver itself is cheap (a few
// indexed aggregate queries) so we don't bother caching. The
// "Generate PDF" button POSTs a real reports row so the snapshot
// freezes; the panel just reads.

type Granularity = 'month' | 'quarter' | 'year';

interface PnlSelection {
  granularity: Granularity;
  year: number;
  month: number;     // 1-12
  quarter: number;   // 1-4
}

const STORAGE_KEY = 'dashboard.pnl.selection';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function defaultSelection(): PnlSelection {
  const now = new Date();
  return {
    granularity: 'month',
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    quarter: Math.floor(now.getMonth() / 3) + 1,
  };
}

function loadSelection(): PnlSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSelection();
    const parsed = JSON.parse(raw);
    const fallback = defaultSelection();
    // Defensive: only keep fields whose shape we trust, otherwise
    // drop back to the current-month default.
    if (
      parsed != null &&
      ['month', 'quarter', 'year'].includes(parsed.granularity) &&
      Number.isInteger(parsed.year)
    ) {
      return {
        granularity: parsed.granularity,
        year: parsed.year,
        month: Number.isInteger(parsed.month) ? parsed.month : fallback.month,
        quarter: Number.isInteger(parsed.quarter)
          ? parsed.quarter
          : fallback.quarter,
      };
    }
  } catch {
    // localStorage unavailable / parse error — fall through.
  }
  return defaultSelection();
}

function buildPeriod(sel: PnlSelection): string {
  if (sel.granularity === 'month') {
    return `${sel.year}-${String(sel.month).padStart(2, '0')}`;
  }
  if (sel.granularity === 'quarter') {
    return `${sel.year}-Q${sel.quarter}`;
  }
  return `${sel.year}`;
}

const fmtCurrency = (v: number): string =>
  `$${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function PnLPanel() {
  const navigate = useNavigate();
  const [sel, setSel] = useState<PnlSelection>(loadSelection);
  const [data, setData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const period = useMemo(() => buildPeriod(sel), [sel]);

  // Persist selection on every change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sel));
    } catch {
      // Quota exceeded / private mode — non-fatal.
    }
  }, [sel]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        granularity: sel.granularity,
        period,
      }).toString();
      const res = await fetch(`/api/v2/pnl?${qs}`, { credentials: 'include' });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.message ?? `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(body.data as PnLData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [sel.granularity, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateField = <K extends keyof PnlSelection>(
    key: K,
    value: PnlSelection[K],
  ) => {
    setSel((prev) => ({ ...prev, [key]: value }));
  };

  const handleGeneratePdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const res = await fetch('/api/v2/report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          report_type: 'pnl',
          parameters: { granularity: sel.granularity, period },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPdfError(body?.message ?? `HTTP ${res.status}`);
        return;
      }
      const reportId = body?.data?.report?.id;
      if (reportId) {
        navigate(`/reports/${reportId}`);
      }
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setPdfBusy(false);
    }
  };

  const salesProfit = data
    ? data.sales.revenue - data.sales.cost + data.sales.mod_revenue - data.sales.mod_cost
    : 0;
  const netProfit = data ? salesProfit + data.sh.revenue : 0;

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.heading}>Profit + Loss</h2>
        <p className={styles.subtitle}>
          {data?.period_label ?? 'Loading…'} — live view over current data.
          PDF generation snapshots the numbers as they stand right now.
        </p>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.toolField}>
          <span className={styles.toolLabel}>Granularity</span>
          <select
            className={styles.input}
            value={sel.granularity}
            onChange={(e) =>
              updateField('granularity', e.target.value as Granularity)
            }
          >
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </label>
        <label className={styles.toolField}>
          <span className={styles.toolLabel}>Year</span>
          <input
            className={styles.input}
            type="number"
            min={2000}
            max={2100}
            value={sel.year}
            onChange={(e) =>
              updateField('year', parseInt(e.target.value, 10) || sel.year)
            }
          />
        </label>
        {sel.granularity === 'month' && (
          <label className={styles.toolField}>
            <span className={styles.toolLabel}>Month</span>
            <select
              className={styles.input}
              value={sel.month}
              onChange={(e) => updateField('month', parseInt(e.target.value, 10))}
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
        {sel.granularity === 'quarter' && (
          <label className={styles.toolField}>
            <span className={styles.toolLabel}>Quarter</span>
            <select
              className={styles.input}
              value={sel.quarter}
              onChange={(e) =>
                updateField('quarter', parseInt(e.target.value, 10))
              }
            >
              <option value={1}>Q1 (Jan – Mar)</option>
              <option value={2}>Q2 (Apr – Jun)</option>
              <option value={3}>Q3 (Jul – Sep)</option>
              <option value={4}>Q4 (Oct – Dec)</option>
            </select>
          </label>
        )}
        <div className={styles.toolbarSpacer} />
        <button
          type="button"
          className={styles.pdfBtn}
          onClick={handleGeneratePdf}
          disabled={pdfBusy || data == null}
        >
          {pdfBusy ? 'Generating…' : 'Generate PDF'}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {pdfError && <div className={styles.error}>{pdfError}</div>}

      {loading && !data && (
        <div className={styles.placeholder}>Loading P&amp;L…</div>
      )}

      {data && (
        <>
          <div className={styles.cards}>
            <SummaryCard
              label="Sales Revenue"
              value={fmtCurrency(data.sales.revenue + data.sales.mod_revenue)}
              subtle={`${data.sales.container_count} container${
                data.sales.container_count === 1 ? '' : 's'
              }`}
            />
            <SummaryCard
              label="Sales Cost"
              value={fmtCurrency(data.sales.cost + data.sales.mod_cost)}
              subtle="Acquisition + modification"
            />
            <SummaryCard
              label="S&H Revenue"
              value={fmtCurrency(data.sh.revenue)}
              subtle={`${data.sh.client_count} client${
                data.sh.client_count === 1 ? '' : 's'
              }`}
            />
            <SummaryCard
              label="Net Profit"
              value={fmtCurrency(netProfit)}
              subtle="Sales + S&H combined"
              tone={netProfit >= 0 ? 'profit' : 'loss'}
            />
          </div>

          <div className={styles.tables}>
            <section className={styles.tableSection}>
              <h3 className={styles.tableHeading}>Sales</h3>
              <table className={styles.table}>
                <tbody>
                  <Row label="Container revenue" value={data.sales.revenue} />
                  <Row label="Container cost (acquisition)" value={data.sales.cost} />
                  <Row label="Modification revenue" value={data.sales.mod_revenue} />
                  <Row label="Modification cost" value={data.sales.mod_cost} />
                  <Row
                    label="Trucking pass-through (informational)"
                    value={data.sales.trucking}
                    subtle
                  />
                  <Row label="Sales profit" value={salesProfit} bold />
                </tbody>
              </table>
            </section>

            <section className={styles.tableSection}>
              <h3 className={styles.tableHeading}>Storage &amp; Handling</h3>
              <table className={styles.table}>
                <tbody>
                  <Row label="In-fees" value={data.sh.in_fee} />
                  <Row label="Out-fees" value={data.sh.out_fee} />
                  <Row label="Storage days" value={data.sh.storage_days} />
                  <Row label="S&H revenue" value={data.sh.revenue} bold />
                </tbody>
              </table>
            </section>
          </div>

          {data.null_cost_count && data.null_cost_count > 0 ? (
            <p className={styles.footnote}>
              {data.null_cost_count} container
              {data.null_cost_count === 1 ? '' : 's'} sold this period
              {data.null_cost_count === 1 ? ' has' : ' have'} no acquisition
              price recorded and {data.null_cost_count === 1 ? 'was' : 'were'}
              {' '}excluded from container cost — net profit shown is an upper
              bound.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtle,
  tone,
}: {
  label: string;
  value: string;
  subtle: string;
  tone?: 'profit' | 'loss';
}) {
  return (
    <div className={styles.card}>
      <span className={styles.cardLabel}>{label}</span>
      <span
        className={`${styles.cardValue} ${
          tone === 'profit' ? styles.profit : ''
        } ${tone === 'loss' ? styles.loss : ''}`}
      >
        {value}
      </span>
      <span className={styles.cardSubtle}>{subtle}</span>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  subtle,
}: {
  label: string;
  value: number;
  bold?: boolean;
  subtle?: boolean;
}) {
  return (
    <tr className={subtle ? styles.subtleRow : ''}>
      <td className={styles.rowLabel}>
        {bold ? <strong>{label}</strong> : label}
      </td>
      <td className={styles.rowValue}>
        {bold ? <strong>{fmtCurrency(value)}</strong> : fmtCurrency(value)}
      </td>
    </tr>
  );
}
