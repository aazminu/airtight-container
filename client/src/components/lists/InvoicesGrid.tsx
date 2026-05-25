import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { InvoiceData, InvoiceStatus } from '../templates/invoice/types';
import { INVOICE_STATUSES } from '../templates/invoice/types';
import { Badge } from '../ui';
import {
  statusBadgeTone,
  statusLabel,
  isAwaitingPastDue,
  AWAITING_OVERDUE_DAYS,
} from './invoiceStatus';
import { fmtCurrency, fmtDate } from '../templates/invoice/format';
import logoSrc from '../../assets/images/airtightfixed.png';
import styles from './InvoicesGrid.module.css';

interface ListResponse {
  status: string;
  results: number;
  data: { invoices: InvoiceData[] };
}

const PAGE_SIZE = 24;
const ALL_CLIENTS = '__all__';
const ALL_STATUSES = '__all_statuses__';

const customerLabel = (data: InvoiceData) =>
  data.customer.business_name || data.customer.client_name || 'Unknown';

const matchesSearch = (data: InvoiceData, q: string) => {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (String(data.invoice_number).includes(needle)) return true;
  if (customerLabel(data).toLowerCase().includes(needle)) return true;
  if (data.customer.client_name?.toLowerCase().includes(needle)) return true;
  if (data.containers.some((c) => c.unit_number?.toLowerCase().includes(needle)))
    return true;
  return false;
};

interface ClientBucket {
  id: number;
  label: string;
  count: number;
}

const buildBuckets = (invoices: InvoiceData[]): ClientBucket[] => {
  const map = new Map<number, ClientBucket>();
  for (const inv of invoices) {
    const id = inv.customer.id;
    if (id == null) continue;
    const existing = map.get(id);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(id, { id, label: customerLabel(inv), count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
};

const SIDEBAR_COLLAPSED_LIMIT = 20;

export default function InvoicesGrid() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
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
        const res = await fetch('/api/v2/invoice', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ListResponse;
        if (cancelled) return;
        setInvoices(body.data.invoices);
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

  // Search-narrowed invoices feed both the grid and the sidebar.
  // Client filter is the final step on top, so the sidebar can still
  // show every matching client even when one is selected.
  const searchFiltered = useMemo(
    () => invoices.filter((inv) => matchesSearch(inv, search.trim())),
    [invoices, search],
  );

  const buckets = useMemo(() => buildBuckets(searchFiltered), [searchFiltered]);

  const filtered = useMemo(() => {
    let rows = searchFiltered;
    if (clientFilter !== ALL_CLIENTS) {
      rows = rows.filter((inv) => String(inv.customer.id) === clientFilter);
    }
    if (statusFilter !== ALL_STATUSES) {
      rows = rows.filter((inv) => inv.status === statusFilter);
    }
    return rows;
  }, [searchFiltered, clientFilter, statusFilter]);

  // Per-status counts feed the sidebar facet. Counted on the
  // search-narrowed set (not client-narrowed) so the operator can see
  // status distribution across the search regardless of which client
  // is selected.
  const statusCounts = useMemo(() => {
    const map = new Map<InvoiceStatus, number>();
    for (const s of INVOICE_STATUSES) map.set(s, 0);
    for (const inv of searchFiltered) {
      map.set(inv.status, (map.get(inv.status) ?? 0) + 1);
    }
    return map;
  }, [searchFiltered]);

  // If the active client falls out of the visible buckets (search
  // narrowed the list past it), snap back to ALL so the user isn't
  // stuck on an empty grid.
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
          <h1 className={styles.title}>Invoices</h1>
          <p className={styles.subtitle}>
            {loading
              ? 'Loading…'
              : `${filtered.length} of ${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className={styles.headerActions}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search invoice #, customer, container…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="addBtn"
            onClick={() => navigate('/invoices/create')}
          >
            + New invoice
          </button>
        </div>
      </header>

      {error && <div className={styles.error}>Failed to load invoices: {error}</div>}

      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Filter invoices">
          <div className={styles.sidebarHeader}>Status</div>
          <button
            type="button"
            className={`${styles.sidebarItem} ${statusFilter === ALL_STATUSES ? styles.active : ''}`}
            onClick={() => setStatusFilter(ALL_STATUSES)}
          >
            <span className={styles.sidebarName}>All statuses</span>
            <span className={styles.sidebarCount}>{searchFiltered.length}</span>
          </button>
          {INVOICE_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.sidebarItem} ${statusFilter === s ? styles.active : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              <span className={styles.sidebarName}>{statusLabel(s)}</span>
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
              {showAllClients
                ? 'Show top 20'
                : `Show all (${buckets.length})`}
            </button>
          )}
          {buckets.length === 0 && (
            <div className={styles.sidebarEmpty}>No matching clients.</div>
          )}
        </aside>

        <section className={styles.main}>
          <div className={styles.grid}>
            {pageItems.map((inv) => (
              <InvoiceTile
                key={inv.invoice_id}
                data={inv}
                onClick={() => navigate(`/invoices/${inv.invoice_id}`)}
              />
            ))}
            {!loading && filtered.length === 0 && (
              <div className={styles.empty}>
                {search || clientFilter !== ALL_CLIENTS
                  ? 'No invoices match the current filters.'
                  : 'No invoices yet.'}
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

interface InvoiceTileProps {
  data: InvoiceData;
  onClick: () => void;
}

function InvoiceTile({ data, onClick }: InvoiceTileProps) {
  const isDeleted = data.deleted_at != null;
  const pastDue = !isDeleted && isAwaitingPastDue(data.status, data.invoice_date);
  return (
    <button
      type="button"
      className={`${styles.tile}${isDeleted ? ` ${styles.tileDeleted}` : ''}`}
      onClick={onClick}
    >
      <div className={styles.thumb} aria-hidden="true">
        <img className={styles.thumbLogo} src={logoSrc} alt="" />
        <div className={styles.thumbWord}>Invoice</div>
      </div>
      <div className={styles.caption}>
        <div className={styles.captionTop}>
          <span className={styles.invoiceNum}>#{data.invoice_number}</span>
          <span className={styles.invoiceDate}>
            {fmtDate(data.invoice_date, { month: 'short', day: 'numeric', year: 'numeric' })}
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
            <Badge tone={statusBadgeTone(data.status)}>
              {statusLabel(data.status)}
            </Badge>
          )}
        </div>
        {pastDue && (
          <div className={styles.pastDue}>
            ≥ {AWAITING_OVERDUE_DAYS} days unpaid
          </div>
        )}
        <div className={styles.containerCount}>
          {isDeleted
            ? 'No containers'
            : `${data.containers.length} ${
                data.containers.length === 1 ? 'container' : 'containers'
              }`}
        </div>
      </div>
    </button>
  );
}
