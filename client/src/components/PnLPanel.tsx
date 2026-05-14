import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PnLData } from './templates/pnl/types';
import styles from './PnLPanel.module.css';

// Live dashboard P&L panel.
// Hits four endpoints whenever the period selection changes:
//   /api/v2/pnl              — current-period P&L (cards + detail tables)
//   /api/v2/pnl/timeseries   — last N periods (trend chart)
//   /api/v2/pnl/top-clients  — top revenue clients in period (bar chart)
//   /api/v2/pnl/yard         — yard snapshot, not period-scoped (pie + bars)
// Generate PDF posts a real /api/v2/report row so the snapshot freezes.

type Granularity = 'month' | 'quarter' | 'year';

interface PnlSelection {
  granularity: Granularity;
  year: number;
  month: number;
  quarter: number;
  trendPeriods: number;
}

const STORAGE_KEY = 'dashboard.pnl.selection';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const STATE_LABELS: Record<string, string> = {
  available: 'Available',
  pending: 'Pending audit',
  hold: 'On hold',
  sold: 'Sold',
  outbound: 'Outbound',
};

const STATE_COLORS: Record<string, string> = {
  available: '#2da44e',
  pending: '#d4a72c',
  hold: '#0969da',
  sold: '#ac3e31',
  outbound: '#7d3c98',
};

function defaultSelection(): PnlSelection {
  const now = new Date();
  return {
    granularity: 'month',
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    quarter: Math.floor(now.getMonth() / 3) + 1,
    trendPeriods: 12,
  };
}

function loadSelection(): PnlSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSelection();
    const parsed = JSON.parse(raw);
    const fallback = defaultSelection();
    if (
      parsed != null &&
      ['month', 'quarter', 'year'].includes(parsed.granularity) &&
      Number.isInteger(parsed.year)
    ) {
      return {
        granularity: parsed.granularity,
        year: parsed.year,
        month: Number.isInteger(parsed.month) ? parsed.month : fallback.month,
        quarter: Number.isInteger(parsed.quarter) ? parsed.quarter : fallback.quarter,
        trendPeriods: Number.isInteger(parsed.trendPeriods)
          ? Math.min(36, Math.max(3, parsed.trendPeriods))
          : fallback.trendPeriods,
      };
    }
  } catch {
    // Fall through to default.
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

const fmtCurrencyShort = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
};

interface TopClient {
  client_id: number;
  client_name: string;
  business_name: string | null;
  invoice_count: number;
  container_count: number;
  revenue: number;
}

interface YardBucket {
  key: string;
  count: number;
}

interface YardSnapshot {
  total: number;
  by_state: YardBucket[];
  by_size: YardBucket[];
  pending_audit: number;
  flagged_damage: number;
}

interface TimeseriesPoint {
  label: string;
  short: string;
  revenue: number;
  cost: number;
  profit: number;
  sh_revenue: number;
}

function toShortLabel(periodLabel: string, granularity: Granularity): string {
  if (granularity === 'month') {
    const m = MONTH_NAMES.findIndex((n) => periodLabel.startsWith(n));
    if (m >= 0) {
      const year = periodLabel.slice(periodLabel.length - 2);
      return `${MONTH_SHORT[m]} '${year}`;
    }
  }
  if (granularity === 'quarter') return periodLabel.replace(' ', ' ');
  return periodLabel;
}

export default function PnLPanel() {
  const navigate = useNavigate();
  const [sel, setSel] = useState<PnlSelection>(loadSelection);
  const [data, setData] = useState<PnLData | null>(null);
  const [series, setSeries] = useState<TimeseriesPoint[] | null>(null);
  const [topClients, setTopClients] = useState<TopClient[] | null>(null);
  const [yard, setYard] = useState<YardSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const period = useMemo(() => buildPeriod(sel), [sel]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sel));
    } catch {
      // Non-fatal.
    }
  }, [sel]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      granularity: sel.granularity,
      period,
    });
    try {
      const [pnlRes, tsRes, tcRes, yardRes] = await Promise.all([
        fetch(`/api/v2/pnl?${qs}`, { credentials: 'include' }),
        fetch(
          `/api/v2/pnl/timeseries?${qs}&periods=${sel.trendPeriods}`,
          { credentials: 'include' },
        ),
        fetch(
          `/api/v2/pnl/top-clients?${qs}&limit=10`,
          { credentials: 'include' },
        ),
        fetch(`/api/v2/pnl/yard`, { credentials: 'include' }),
      ]);
      const pnlBody = await pnlRes.json();
      if (!pnlRes.ok) {
        setError(pnlBody?.message ?? `HTTP ${pnlRes.status}`);
        setData(null);
        return;
      }
      setData(pnlBody.data as PnLData);
      if (tsRes.ok) {
        const tsBody = await tsRes.json();
        const points: TimeseriesPoint[] = (tsBody.data?.periods ?? []).map(
          (p: PnLData) => ({
            label: p.period_label,
            short: toShortLabel(p.period_label, sel.granularity),
            revenue: p.sales.revenue + p.sales.mod_revenue,
            cost: p.sales.cost + p.sales.mod_cost,
            profit:
              p.sales.revenue +
              p.sales.mod_revenue -
              p.sales.cost -
              p.sales.mod_cost +
              p.sh.revenue,
            sh_revenue: p.sh.revenue,
          }),
        );
        setSeries(points);
      } else {
        setSeries(null);
      }
      if (tcRes.ok) {
        const tcBody = await tcRes.json();
        setTopClients(tcBody.data?.clients ?? []);
      } else {
        setTopClients(null);
      }
      if (yardRes.ok) {
        const yardBody = await yardRes.json();
        setYard(yardBody.data as YardSnapshot);
      } else {
        setYard(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [sel.granularity, sel.trendPeriods, period]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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
      if (reportId) navigate(`/reports/${reportId}`);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setPdfBusy(false);
    }
  };

  const salesProfit = data
    ? data.sales.revenue +
      data.sales.mod_revenue -
      data.sales.cost -
      data.sales.mod_cost
    : 0;
  const netProfit = data ? salesProfit + data.sh.revenue : 0;
  const avgRevenuePerBox = data && data.sales.container_count > 0
    ? (data.sales.revenue + data.sales.mod_revenue) / data.sales.container_count
    : 0;
  const modMarginPct = data && data.sales.mod_revenue > 0
    ? ((data.sales.mod_revenue - data.sales.mod_cost) / data.sales.mod_revenue) * 100
    : null;

  const yardStateData = useMemo(() => {
    if (!yard) return [];
    return yard.by_state.map((b) => ({
      key: b.key,
      name: STATE_LABELS[b.key] ?? b.key,
      value: b.count,
      color: STATE_COLORS[b.key] ?? '#888',
    }));
  }, [yard]);

  // Collapse the noisy "size" buckets — there's a long tail of free-text
  // values from the legacy schema. Show the top 6 + an "Other" rollup.
  const yardSizeData = useMemo(() => {
    if (!yard) return [];
    const top = yard.by_size.slice(0, 6).map((b) => ({
      key: b.key,
      count: b.count,
    }));
    const rest = yard.by_size.slice(6).reduce((sum, b) => sum + b.count, 0);
    if (rest > 0) top.push({ key: 'Other', count: rest });
    return top;
  }, [yard]);

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.heading}>Profit + Loss</h2>
        <p className={styles.subtitle}>
          {data?.period_label ?? 'Loading…'} — live view over current data. PDF generation snapshots the numbers as they stand right now.
        </p>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.toolField}>
          <span className={styles.toolLabel}>Granularity</span>
          <select
            className={styles.input}
            value={sel.granularity}
            onChange={(e) => updateField('granularity', e.target.value as Granularity)}
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
            onChange={(e) => updateField('year', parseInt(e.target.value, 10) || sel.year)}
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
                <option key={m} value={i + 1}>{m}</option>
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
              onChange={(e) => updateField('quarter', parseInt(e.target.value, 10))}
            >
              <option value={1}>Q1 (Jan – Mar)</option>
              <option value={2}>Q2 (Apr – Jun)</option>
              <option value={3}>Q3 (Jul – Sep)</option>
              <option value={4}>Q4 (Oct – Dec)</option>
            </select>
          </label>
        )}
        <label className={styles.toolField}>
          <span className={styles.toolLabel}>Trend window</span>
          <select
            className={styles.input}
            value={sel.trendPeriods}
            onChange={(e) => updateField('trendPeriods', parseInt(e.target.value, 10))}
          >
            <option value={3}>Last 3</option>
            <option value={6}>Last 6</option>
            <option value={12}>Last 12</option>
            <option value={24}>Last 24</option>
          </select>
        </label>
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

      {loading && !data && <div className={styles.placeholder}>Loading P&amp;L…</div>}

      {data && (
        <>
          <div className={styles.kpis}>
            <KpiCard
              label="Sales Revenue"
              value={fmtCurrency(data.sales.revenue + data.sales.mod_revenue)}
              subtle={`${data.sales.container_count} container${
                data.sales.container_count === 1 ? '' : 's'
              }`}
            />
            <KpiCard
              label="Sales Cost"
              value={fmtCurrency(data.sales.cost + data.sales.mod_cost)}
              subtle="Acquisition + modification"
            />
            <KpiCard
              label="Net Profit"
              value={fmtCurrency(netProfit)}
              subtle="Sales + S&H combined"
              tone={netProfit >= 0 ? 'profit' : 'loss'}
            />
            <KpiCard
              label="Avg Revenue / Box"
              value={fmtCurrency(avgRevenuePerBox)}
              subtle={
                data.sales.container_count
                  ? `Across ${data.sales.container_count} container${
                      data.sales.container_count === 1 ? '' : 's'
                    }`
                  : 'No containers'
              }
            />
            <KpiCard
              label="Mod Margin"
              value={modMarginPct == null ? '—' : `${modMarginPct.toFixed(1)}%`}
              subtle={
                modMarginPct == null
                  ? 'No mod revenue this period'
                  : `${fmtCurrency(data.sales.mod_revenue - data.sales.mod_cost)} net`
              }
            />
            <KpiCard
              label="S&H Revenue"
              value={fmtCurrency(data.sh.revenue)}
              subtle={`${data.sh.client_count} client${
                data.sh.client_count === 1 ? '' : 's'
              }`}
            />
          </div>

          {series && series.length > 0 && (
            <section className={styles.chartCard}>
              <header className={styles.chartHeader}>
                <h3 className={styles.chartTitle}>Trend</h3>
                <span className={styles.chartHint}>
                  Last {sel.trendPeriods}{' '}
                  {sel.granularity === 'month'
                    ? 'months'
                    : sel.granularity === 'quarter'
                      ? 'quarters'
                      : 'years'}
                </span>
              </header>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart
                  data={series}
                  margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="short"
                    stroke="var(--text-muted)"
                    fontSize={12}
                    tickMargin={6}
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={12}
                    tickFormatter={fmtCurrencyShort}
                    width={64}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    formatter={(v) => fmtCurrency(Number(v))}
                    labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#2da44e"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    name="Cost"
                    stroke="#ac3e31"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Profit"
                    stroke="#0969da"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </section>
          )}

          <div className={styles.duo}>
            <section className={styles.chartCard}>
              <header className={styles.chartHeader}>
                <h3 className={styles.chartTitle}>Top Clients</h3>
                <span className={styles.chartHint}>by revenue · this period</span>
              </header>
              {topClients && topClients.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(180, topClients.length * 28)}>
                  <BarChart
                    layout="vertical"
                    data={topClients.map((c) => ({
                      name: c.client_name.trim(),
                      revenue: c.revenue,
                    }))}
                    margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      type="number"
                      stroke="var(--text-muted)"
                      fontSize={11}
                      tickFormatter={fmtCurrencyShort}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="var(--text-muted)"
                      fontSize={11}
                      width={130}
                      interval={0}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      formatter={(v) => fmtCurrency(Number(v))}
                    />
                    <Bar dataKey="revenue" fill="#ac3e31" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className={styles.chartEmpty}>
                  No invoiced clients in this period.
                </div>
              )}
            </section>

            <section className={styles.chartCard}>
              <header className={styles.chartHeader}>
                <h3 className={styles.chartTitle}>Yard Snapshot</h3>
                <span className={styles.chartHint}>
                  {yard ? `${yard.total} total · live` : 'Loading…'}
                </span>
              </header>
              {yard ? (
                <div className={styles.yardGrid}>
                  <div>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={yardStateData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                        >
                          {yardStateData.map((entry) => (
                            <Cell key={entry.key} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                          formatter={(v) => `${Number(v)} container${Number(v) === 1 ? '' : 's'}`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className={styles.legendList}>
                      {yardStateData.map((s) => (
                        <li key={s.key}>
                          <span
                            className={styles.legendDot}
                            style={{ background: s.color }}
                          />
                          {s.name}
                          <span className={styles.legendValue}>{s.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className={styles.subTitle}>By size</h4>
                    <ul className={styles.sizeList}>
                      {yardSizeData.map((s) => (
                        <li key={s.key} className={styles.sizeRow}>
                          <span className={styles.sizeLabel}>{s.key}</span>
                          <div className={styles.sizeBar}>
                            <div
                              className={styles.sizeFill}
                              style={{
                                width: `${
                                  (s.count / yard.total) * 100
                                }%`,
                              }}
                            />
                          </div>
                          <span className={styles.sizeValue}>{s.count}</span>
                        </li>
                      ))}
                    </ul>
                    <div className={styles.yardFootRow}>
                      <span>
                        <strong>{yard.pending_audit}</strong> pending audit
                      </span>
                      <span>
                        <strong>{yard.flagged_damage}</strong> flagged damage
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.chartEmpty}>Loading yard data…</div>
              )}
            </section>
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
              price recorded and {data.null_cost_count === 1 ? 'was' : 'were'}{' '}
              excluded from container cost — net profit shown is an upper bound.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function KpiCard({
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
