import {
  useContext,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react';
import { Badge } from '../components/ui';
import { InventoryEditor } from '../components/forms/InventoryEditor';
import { userContext } from '../context/restaurantcontext';
import styles from './Inventory.module.css';

type InventoryState = 'pending' | 'available' | 'hold' | 'sold' | 'outbound';

interface InventoryRow {
  id: number;
  date: string;
  unit_number: string;
  size: string;
  damage: string | null;
  trucking_company: string | null;
  release_number_id: number | null;
  sale_company_id: number | null;
  notes: string | null;
  acquisition_price: string | number | null;
  state: InventoryState;
  is_pending_audit: boolean;
  photos: string[] | null;
  sale_company_name: string | null;
  release_number_value: string | null;
  outbound_date: string | null;
  invoice_number: number | null;
}

type Tab = 'available' | 'pending' | 'sold';

const TABS: { id: Tab; label: string; states: InventoryState[] }[] = [
  { id: 'available', label: 'Available', states: ['available', 'hold'] },
  { id: 'pending', label: 'Pending', states: ['pending'] },
  { id: 'sold', label: 'Sold', states: ['sold', 'outbound'] },
];

const PER_PAGE_OPTIONS = [25, 50, 100];

type SortKey =
  | 'unit_number'
  | 'size'
  | 'sale_company_name'
  | 'date'
  | 'days_onsite'
  | 'acquisition_price'
  | 'release_number_value'
  | 'outbound_date'
  | 'invoice_number';

interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

const MS_PER_DAY = 86_400_000;
const daysOnsite = (iso: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / MS_PER_DAY));

const fmtDate = (iso: string | null): string =>
  iso ? iso.slice(0, 10) : '—';

const fmtMoney = (v: string | number | null): string => {
  if (v == null || v === '') return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const compareValues = (
  a: string | number | null,
  b: string | number | null,
  dir: 'asc' | 'desc',
): number => {
  const aNull = a == null || a === '';
  const bNull = b == null || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1; // empties always last
  if (bNull) return -1;
  let cmp: number;
  if (typeof a === 'number' && typeof b === 'number') cmp = a - b;
  else cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? cmp : -cmp;
};

const matchesSearch = (row: InventoryRow, q: string): boolean => {
  if (!q) return true;
  const needle = q.toLowerCase();
  const haystacks: (string | null | undefined)[] = [
    row.unit_number,
    row.size,
    row.sale_company_name,
    row.release_number_value,
    row.damage,
    row.notes,
    row.trucking_company,
    row.invoice_number != null ? String(row.invoice_number) : null,
    row.acquisition_price != null ? String(row.acquisition_price) : null,
  ];
  return haystacks.some((h) => h && h.toLowerCase().includes(needle));
};

export default function Inventory() {
  const { setPopup } = useContext(userContext) as {
    setPopup: (msg: string) => void;
  };

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('available');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [sort, setSort] = useState<SortState>({ key: 'date', dir: 'desc' });
  const [editing, setEditing] = useState<InventoryRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/inventory', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          data: { inventory: InventoryRow[] };
        };
        if (cancelled) return;
        setRows(body.data.inventory);
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

  // Tab counts apply state segmentation BUT not search — counts reflect
  // total inventory in each bucket so the user can see what's hidden by
  // the active search/tab.
  const tabCounts = useMemo(() => {
    const c = { available: 0, pending: 0, sold: 0 } as Record<Tab, number>;
    for (const r of rows) {
      for (const t of TABS) {
        if (t.states.includes(r.state)) c[t.id] += 1;
      }
    }
    return c;
  }, [rows]);

  const activeTab = TABS.find((t) => t.id === tab)!;

  const filtered = useMemo(() => {
    const q = search.trim();
    return rows
      .filter((r) => activeTab.states.includes(r.state))
      .filter((r) => matchesSearch(r, q));
  }, [rows, activeTab, search]);

  const sorted = useMemo(() => {
    const copy = filtered.slice();
    copy.sort((a, b) => {
      switch (sort.key) {
        case 'unit_number':
          return compareValues(a.unit_number, b.unit_number, sort.dir);
        case 'size':
          return compareValues(a.size, b.size, sort.dir);
        case 'sale_company_name':
          return compareValues(a.sale_company_name, b.sale_company_name, sort.dir);
        case 'date':
          return compareValues(a.date, b.date, sort.dir);
        case 'days_onsite':
          return compareValues(daysOnsite(a.date), daysOnsite(b.date), sort.dir);
        case 'acquisition_price':
          return compareValues(
            a.acquisition_price == null ? null : Number(a.acquisition_price),
            b.acquisition_price == null ? null : Number(b.acquisition_price),
            sort.dir,
          );
        case 'release_number_value':
          return compareValues(a.release_number_value, b.release_number_value, sort.dir);
        case 'outbound_date':
          return compareValues(a.outbound_date, b.outbound_date, sort.dir);
        case 'invoice_number':
          return compareValues(a.invoice_number, b.invoice_number, sort.dir);
        default:
          return 0;
      }
    });
    return copy;
  }, [filtered, sort]);

  // Math.ceil already gives the right page count. The legacy
  // InventoryList.jsx bumped this by 1 when len % perPage === 0 which
  // produced a phantom empty trailing page (PLAN §7 Phase 4 callout).
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);
  const pageStart = (page - 1) * perPage;
  const pageItems = sorted.slice(pageStart, pageStart + perPage);

  // Reset page when filter axes change so the user doesn't land on an
  // empty trailing page.
  useEffect(() => {
    setPage(1);
  }, [tab, search, perPage]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  };

  const handleSaved = (updated: InventoryRow) => {
    setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    setEditing(null);
    setPopup('Container updated.');
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Inventory</h1>
          <p className={styles.subtitle}>
            {loading
              ? 'Loading…'
              : `${filtered.length} of ${tabCounts[tab]} in ${activeTab.label.toLowerCase()}`}
          </p>
        </div>
        <div className={styles.headerActions}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search unit#, sale co., release, notes…"
            value={search}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setSearch(e.target.value)
            }
          />
        </div>
      </header>

      {error && <div className={styles.error}>Failed to load inventory: {error}</div>}

      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tab} ${tab === t.id ? styles.active : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className={styles.tabCount}>{tabCounts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <Th label="Unit #" sortKey="unit_number" sort={sort} onSort={toggleSort} />
              <Th label="Size" sortKey="size" sort={sort} onSort={toggleSort} />
              <Th
                label="Sale Co."
                sortKey="sale_company_name"
                sort={sort}
                onSort={toggleSort}
              />
              <Th
                label="Date Added"
                sortKey="date"
                sort={sort}
                onSort={toggleSort}
              />
              <Th
                label="Days Onsite"
                sortKey="days_onsite"
                sort={sort}
                onSort={toggleSort}
              />
              <Th
                label="Acq. Price"
                sortKey="acquisition_price"
                sort={sort}
                onSort={toggleSort}
              />
              <Th
                label="Release #"
                sortKey="release_number_value"
                sort={sort}
                onSort={toggleSort}
              />
              {tab === 'sold' && (
                <>
                  <Th
                    label="Outbound"
                    sortKey="outbound_date"
                    sort={sort}
                    onSort={toggleSort}
                  />
                  <Th
                    label="Invoice #"
                    sortKey="invoice_number"
                    sort={sort}
                    onSort={toggleSort}
                  />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((r) => (
              <tr key={r.id} onClick={() => setEditing(r)}>
                <td>
                  <span className={styles.unitCell}>
                    {r.unit_number.trim()}
                    {r.state === 'hold' && <Badge tone="warning">Held</Badge>}
                    {r.state === 'outbound' && <Badge tone="info">Outbound</Badge>}
                  </span>
                </td>
                <td>{r.size}</td>
                <td className={r.sale_company_name ? '' : styles.muted}>
                  {r.sale_company_name || '—'}
                </td>
                <td>{fmtDate(r.date)}</td>
                <td>{daysOnsite(r.date)}</td>
                <td className={r.acquisition_price ? '' : styles.muted}>
                  {fmtMoney(r.acquisition_price)}
                </td>
                <td className={r.release_number_value ? '' : styles.muted}>
                  {r.release_number_value || '—'}
                </td>
                {tab === 'sold' && (
                  <>
                    <td className={r.outbound_date ? '' : styles.muted}>
                      {fmtDate(r.outbound_date)}
                    </td>
                    <td className={r.invoice_number ? '' : styles.muted}>
                      {r.invoice_number ?? '—'}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!loading && pageItems.length === 0 && (
              <tr>
                <td colSpan={tab === 'sold' ? 9 : 7} className={styles.empty}>
                  {search
                    ? 'No containers match the current search.'
                    : `No containers in ${activeTab.label.toLowerCase()}.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
          disabled={page >= totalPages}
        >
          Next ›
        </button>
        <span className={styles.perPage}>
          Per page:
          <select
            className={styles.perPageSelect}
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </span>
      </div>

      <InventoryEditor
        row={editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
        onError={(msg) => setPopup(msg)}
      />
    </div>
  );
}

interface ThProps {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (k: SortKey) => void;
}

function Th({ label, sortKey, sort, onSort }: ThProps) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      className={styles.sortable}
      onClick={() => onSort(sortKey)}
      title="Click to sort"
    >
      {label}
      <span className={`${styles.sortIcon} ${active ? styles.active : ''}`}>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  );
}

