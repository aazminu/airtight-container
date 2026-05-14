import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../ui';
import logoSrc from '../../assets/images/airtightfixed.png';
import styles from './ReportsGrid.module.css';

export type ReportType =
  | 'delivery_sheet'
  | 'io_report'
  | 'pnl'
  | 'sh_statement';

export interface ReportRow {
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

interface ListResponse {
  status: string;
  results: number;
  data: { reports: ReportRow[] };
}

const PAGE_SIZE = 24;
const ALL_TYPES = '__all__';

const TYPE_LABELS: Record<ReportType, string> = {
  delivery_sheet: 'Delivery sheet',
  io_report: 'In / Out',
  pnl: 'Profit + Loss',
  sh_statement: 'S&H statement',
};

const TYPE_WORDMARKS: Record<ReportType, string> = {
  delivery_sheet: 'Delivery',
  io_report: 'In / Out',
  pnl: 'P+L',
  sh_statement: 'S+H',
};

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

function summarize(row: ReportRow): string {
  const resolved = row.resolved_data ?? {};
  const params = row.parameters ?? {};
  switch (row.report_type) {
    case 'delivery_sheet': {
      const ctr = (resolved as { container?: { unit_number?: string } })
        .container;
      return ctr?.unit_number?.trim() ?? `Container #${params.container_id ?? ''}`;
    }
    case 'io_report': {
      const start = (resolved as { start_date?: string }).start_date ?? params.start_date;
      const end = (resolved as { end_date?: string }).end_date ?? params.end_date;
      if (!start && !end) return 'Date range';
      return `${start ?? '?'} → ${end ?? '?'}`;
    }
    case 'pnl': {
      const label = (resolved as { period_label?: string }).period_label;
      if (label) return label;
      return `${params.granularity ?? ''} ${params.period ?? ''}`.trim();
    }
    case 'sh_statement': {
      const client = (resolved as {
        client?: { business_name?: string | null; client_name?: string };
      }).client;
      return (
        client?.business_name ||
        client?.client_name ||
        `Client #${params.client_id ?? ''}`
      );
    }
  }
}

const matchesSearch = (row: ReportRow, q: string): boolean => {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (String(row.id).includes(needle)) return true;
  if (TYPE_LABELS[row.report_type].toLowerCase().includes(needle)) return true;
  if (summarize(row).toLowerCase().includes(needle)) return true;
  return false;
};

interface TypeBucket {
  key: ReportType;
  label: string;
  count: number;
}

const buildBuckets = (rows: ReportRow[]): TypeBucket[] => {
  const counts: Record<ReportType, number> = {
    delivery_sheet: 0,
    io_report: 0,
    pnl: 0,
    sh_statement: 0,
  };
  for (const r of rows) {
    counts[r.report_type] += 1;
  }
  return (Object.keys(counts) as ReportType[])
    .map((key) => ({ key, label: TYPE_LABELS[key], count: counts[key] }))
    .filter((b) => b.count > 0);
};

export default function ReportsGrid() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/report', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ListResponse;
        if (cancelled) return;
        setReports(body.data.reports);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const searchFiltered = useMemo(
    () => reports.filter((r) => matchesSearch(r, search.trim())),
    [reports, search],
  );

  const buckets = useMemo(() => buildBuckets(searchFiltered), [searchFiltered]);

  const filtered = useMemo(
    () =>
      typeFilter === ALL_TYPES
        ? searchFiltered
        : searchFiltered.filter((r) => r.report_type === typeFilter),
    [searchFiltered, typeFilter],
  );

  useEffect(() => {
    if (typeFilter === ALL_TYPES) return;
    if (!buckets.some((b) => b.key === typeFilter)) {
      setTypeFilter(ALL_TYPES);
    }
  }, [buckets, typeFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Reports</h1>
          <p className={styles.subtitle}>
            {loading
              ? 'Loading…'
              : `${filtered.length} of ${reports.length} report${reports.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className={styles.headerActions}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search id, type, summary…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="addBtn"
            onClick={() => navigate('/reports/new')}
          >
            + New report
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.error}>Failed to load reports: {error}</div>
      )}

      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Filter by type">
          <div className={styles.sidebarHeader}>Type</div>
          <button
            type="button"
            className={`${styles.sidebarItem} ${typeFilter === ALL_TYPES ? styles.active : ''}`}
            onClick={() => setTypeFilter(ALL_TYPES)}
          >
            <span className={styles.sidebarName}>All types</span>
            <span className={styles.sidebarCount}>{searchFiltered.length}</span>
          </button>
          <div className={styles.sidebarDivider} />
          {buckets.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`${styles.sidebarItem} ${b.key === typeFilter ? styles.active : ''}`}
              onClick={() => setTypeFilter(b.key)}
            >
              <span className={styles.sidebarName}>{b.label}</span>
              <span className={styles.sidebarCount}>{b.count}</span>
            </button>
          ))}
          {buckets.length === 0 && !loading && (
            <div className={styles.sidebarEmpty}>No matching reports.</div>
          )}
        </aside>

        <section className={styles.main}>
          <div className={styles.grid}>
            {pageItems.map((row) => (
              <ReportTile
                key={row.id}
                row={row}
                onClick={() => navigate(`/reports/${row.id}`)}
              />
            ))}
            {!loading && filtered.length === 0 && (
              <div className={styles.empty}>
                {search || typeFilter !== ALL_TYPES
                  ? 'No reports match the current filters.'
                  : 'No reports yet. Click "+ New report" to generate one.'}
              </div>
            )}
          </div>

          {filtered.length > PAGE_SIZE && (
            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ‹ Prev
              </button>
              <span className={styles.pageInfo}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next ›
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

interface ReportTileProps {
  row: ReportRow;
  onClick: () => void;
}

function ReportTile({ row, onClick }: ReportTileProps) {
  const sentTone = row.emailed_at ? 'success' : 'neutral';
  const pdfTone = row.pdf_s3_key ? 'success' : 'neutral';
  return (
    <button type="button" className={styles.tile} onClick={onClick}>
      <div className={styles.thumb} aria-hidden="true">
        <img className={styles.thumbLogo} src={logoSrc} alt="" />
        <div className={styles.thumbWord}>{TYPE_WORDMARKS[row.report_type]}</div>
      </div>
      <div className={styles.caption}>
        <div className={styles.captionTop}>
          <span className={styles.reportNum}>#{row.id}</span>
          <span className={styles.reportDate}>{fmtDate(row.generated_at)}</span>
        </div>
        <div className={styles.typeLabel}>{TYPE_LABELS[row.report_type]}</div>
        <div className={styles.summary} title={summarize(row)}>
          {summarize(row)}
        </div>
        <div className={styles.captionFlags}>
          <Badge tone={pdfTone}>{row.pdf_s3_key ? 'PDF' : 'No PDF'}</Badge>
          <Badge tone={sentTone}>{row.emailed_at ? 'Sent' : 'Unsent'}</Badge>
        </div>
      </div>
    </button>
  );
}
