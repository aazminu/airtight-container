import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { QuoteData, QuoteStatus } from '../templates/quote/types';
import { QUOTE_STATUSES } from '../templates/quote/types';
import { Badge } from '../ui';
import { fmtCurrency, fmtDate } from '../templates/quote/format';
import logoSrc from '../../assets/images/airtightfixed.png';
import styles from './QuotesGrid.module.css';

interface ListResponse {
  status: string;
  results: number;
  data: { quotes: QuoteData[] };
}

const PAGE_SIZE = 24;
const ALL_CLIENTS = '__all__';
const ALL_STATUSES = '__all_statuses__';

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
};

const quoteStatusTone = (s: QuoteStatus) =>
  s === 'sent' ? ('info' as const) : ('warning' as const);

const customerLabel = (data: QuoteData) =>
  data.customer.business_name || data.customer.client_name || 'Unknown';

const matchesSearch = (data: QuoteData, q: string) => {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (String(data.quote_number).toLowerCase().includes(needle)) return true;
  if (customerLabel(data).toLowerCase().includes(needle)) return true;
  if (data.customer.client_name?.toLowerCase().includes(needle)) return true;
  if (data.lines.some((l) => l.description?.toLowerCase().includes(needle)))
    return true;
  return false;
};

interface ClientBucket {
  id: number;
  label: string;
  count: number;
}

const buildBuckets = (quotes: QuoteData[]): ClientBucket[] => {
  const map = new Map<number, ClientBucket>();
  for (const q of quotes) {
    const id = q.customer.id;
    if (id == null) continue;
    const existing = map.get(id);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(id, { id, label: customerLabel(q), count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
};

const SIDEBAR_COLLAPSED_LIMIT = 20;

export default function QuotesGrid() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState<string>(ALL_CLIENTS);
  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUSES);
  const [page, setPage] = useState(1);
  const [showAllClients, setShowAllClients] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/quote', { credentials: 'include' });
        if (!res.ok) throw new Error(`Something went wrong`);
        const body = (await res.json()) as ListResponse;
        if (cancelled) return;
        setQuotes(body.data.quotes);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const searchFiltered = useMemo(
    () => quotes.filter((q) => matchesSearch(q, search.trim())),
    [quotes, search],
  );

  const buckets = useMemo(() => buildBuckets(searchFiltered), [searchFiltered]);

  const filtered = useMemo(() => {
    let rows = searchFiltered;
    if (clientFilter !== ALL_CLIENTS) {
      rows = rows.filter((q) => String(q.customer.id) === clientFilter);
    }
    if (statusFilter !== ALL_STATUSES) {
      rows = rows.filter((q) => q.status === statusFilter);
    }
    return rows;
  }, [searchFiltered, clientFilter, statusFilter]);

  const statusCounts = useMemo(() => {
    const map = new Map<QuoteStatus, number>();
    for (const s of QUOTE_STATUSES) map.set(s, 0);
    for (const q of searchFiltered) {
      map.set(q.status, (map.get(q.status) ?? 0) + 1);
    }
    return map;
  }, [searchFiltered]);

  useEffect(() => {
    if (clientFilter === ALL_CLIENTS) return;
    if (!buckets.some((b) => String(b.id) === clientFilter)) {
      setClientFilter(ALL_CLIENTS);
    }
  }, [buckets, clientFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, clientFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Quotes</h1>
          <p className={styles.subtitle}>
            {loading
              ? 'Loading…'
              : `${filtered.length} of ${quotes.length} quote${quotes.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className={styles.headerActions}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search quote #, customer, line…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="addBtn"
            onClick={() => navigate('/quotes/create')}
          >
            + New quote
          </button>
        </div>
      </header>

      {error && <div className={styles.error}>Failed to load quotes: {error}</div>}

      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Filter quotes">
          <div className={styles.sidebarHeader}>Status</div>
          <button
            type="button"
            className={`${styles.sidebarItem} ${statusFilter === ALL_STATUSES ? styles.active : ''}`}
            onClick={() => setStatusFilter(ALL_STATUSES)}
          >
            <span className={styles.sidebarName}>All statuses</span>
            <span className={styles.sidebarCount}>{searchFiltered.length}</span>
          </button>
          {QUOTE_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.sidebarItem} ${statusFilter === s ? styles.active : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              <span className={styles.sidebarName}>{QUOTE_STATUS_LABEL[s]}</span>
              <span className={styles.sidebarCount}>{statusCounts.get(s) ?? 0}</span>
            </button>
          ))}
          <div className={styles.sidebarDivider} />
          <div className={styles.sidebarHeader}>Client</div>
          <button
            type="button"
            className={`${styles.sidebarItem} ${clientFilter === ALL_CLIENTS ? styles.active : ''}`}
            onClick={() => setClientFilter(ALL_CLIENTS)}
          >
            <span className={styles.sidebarName}>All clients</span>
            <span className={styles.sidebarCount}>{searchFiltered.length}</span>
          </button>
          <div className={styles.sidebarDivider} />
          {(showAllClients ? buckets : buckets.slice(0, SIDEBAR_COLLAPSED_LIMIT)).map((b) => (
            <button
              key={b.id}
              type="button"
              className={`${styles.sidebarItem} ${String(b.id) === clientFilter ? styles.active : ''}`}
              onClick={() => setClientFilter(String(b.id))}
              title={b.label}
            >
              <span className={styles.sidebarName}>{b.label}</span>
              <span className={styles.sidebarCount}>{b.count}</span>
            </button>
          ))}
          {buckets.length > SIDEBAR_COLLAPSED_LIMIT && (
            <button
              type="button"
              className={styles.sidebarMore}
              onClick={() => setShowAllClients((v) => !v)}
            >
              {showAllClients ? 'Show top 20' : `Show all (${buckets.length})`}
            </button>
          )}
          {buckets.length === 0 && (
            <div className={styles.sidebarEmpty}>No matching clients.</div>
          )}
        </aside>

        <section className={styles.main}>
          <div className={styles.grid}>
            {pageItems.map((q) => (
              <QuoteTile
                key={q.id}
                data={q}
                onClick={() => navigate(`/quotes/${q.id}`)}
              />
            ))}
            {!loading && filtered.length === 0 && (
              <div className={styles.empty}>
                {search || clientFilter !== ALL_CLIENTS
                  ? 'No quotes match the current filters.'
                  : 'No quotes yet.'}
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

interface QuoteTileProps {
  data: QuoteData;
  onClick: () => void;
}

function QuoteTile({ data, onClick }: QuoteTileProps) {
  const isDeleted = data.deleted_at != null;
  return (
    <button
      type="button"
      className={`${styles.tile}${isDeleted ? ` ${styles.tileDeleted}` : ''}`}
      onClick={onClick}
    >
      <div className={styles.thumb} aria-hidden="true">
        <img className={styles.thumbLogo} src={logoSrc} alt="" />
        <div className={styles.thumbWord}>Quote</div>
      </div>
      <div className={styles.caption}>
        <div className={styles.captionTop}>
          <span className={styles.invoiceNum}>{data.quote_number}</span>
          <span className={styles.invoiceDate}>
            {fmtDate(data.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <div className={styles.customer} title={customerLabel(data)}>
          {customerLabel(data)}
        </div>
        <div className={styles.captionTotalRow}>
          <span className={styles.total}>{fmtCurrency(data.total)}</span>
          {isDeleted ? (
            <Badge tone="danger">Deleted</Badge>
          ) : (
            <Badge tone={quoteStatusTone(data.status)}>
              {QUOTE_STATUS_LABEL[data.status]}
            </Badge>
          )}
        </div>
        <div className={styles.containerCount}>
          {isDeleted
            ? 'No lines'
            : `${data.lines.length} ${data.lines.length === 1 ? 'line' : 'lines'}`}
        </div>
      </div>
    </button>
  );
}
