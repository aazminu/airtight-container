import { useEffect, useMemo, useState } from 'react';
import { Button, Modal } from '../components/ui';
import styles from './PickupNumbers.module.css';

type Bucket = 'active' | 'filled';

interface PickupNumber {
  pickup_id: number;
  pickup_count: number;          // quota
  pickup_number: string;
  assignment_count: number;      // boxes already attached to this pickup
  is_complete: boolean;
}

interface Company {
  id: number;
  company: string;
  numbers: PickupNumber[];
}

interface Assignment {
  sh_inventory_id: number;
  assigned_at: string;
  pickup_damage: string | null;
  unit_number: string;
  size: string;
  intake_date: string;
  checkout_date: string | null;
  state: string;
  customer_label: string | null;
}

interface PickupsApi {
  data: { pickups: Company[] };
}

interface AssignmentsApi {
  data: { assignments: Assignment[] };
}

const STATE_LABELS: Record<string, string> = {
  pending: 'Pending audit',
  in_storage: 'On site',
  checked_out: 'Checked out',
};

// Admin page for pickup numbers — the outbound analogue of release
// numbers. Quotas, but no pre-bound unit numbers; boxes attach at
// outbound time via the Storage & Handling outbound flow.
export default function PickupNumbers() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPickupId, setOpenPickupId] = useState<number | null>(null);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [bucket, setBucket] = useState<Bucket>('active');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/pickup', { credentials: 'include' });
      if (!res.ok) throw new Error('Something went wrong');
      const body = (await res.json()) as PickupsApi;
      setCompanies(body.data.pickups);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const searchLower = search.trim().toLowerCase();

  // A pickup is "filled" once assignment_count >= quota OR is_complete is true
  // (admin can mark it complete early).
  const isFilled = (p: PickupNumber) =>
    p.is_complete || p.assignment_count >= p.pickup_count;

  const bucketCounts = useMemo(() => {
    let active = 0;
    let filled = 0;
    for (const c of companies) {
      for (const p of c.numbers) {
        if (isFilled(p)) filled++;
        else active++;
      }
    }
    return { active, filled };
  }, [companies]);

  const filtered = useMemo<Company[]>(() => {
    return companies
      .map((c) => ({
        ...c,
        numbers: c.numbers.filter((p) => {
          if (bucket === 'active' && isFilled(p)) return false;
          if (bucket === 'filled' && !isFilled(p)) return false;
          if (!searchLower) return true;
          return p.pickup_number.toLowerCase().includes(searchLower);
        }),
      }))
      .filter((c) => c.numbers.length > 0);
  }, [companies, searchLower, bucket]);

  const effectivelyExpanded = (id: number): boolean => {
    if (searchLower) return true;
    return expandedCompanies.has(id);
  };

  const toggleCompany = (id: number) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Pickup numbers</h1>
            <p className={styles.subtitle}>
              Quotas for boxes leaving the yard. Issued by the freight
              company; assigned per box at outbound. Strict no-overenroll.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>+ New pickup</Button>
        </div>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${bucket === 'active' ? styles.tabActive : ''}`}
            onClick={() => setBucket('active')}
          >
            Active
            <span className={styles.tabCount}>{bucketCounts.active}</span>
          </button>
          <button
            type="button"
            className={`${styles.tab} ${bucket === 'filled' ? styles.tabActive : ''}`}
            onClick={() => setBucket('filled')}
          >
            Filled
            <span className={styles.tabCount}>{bucketCounts.filled}</span>
          </button>
        </div>
        <input
          type="search"
          className={styles.search}
          placeholder="Search pickup numbers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {loading && <p>Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div className={styles.empty}>
          {searchLower
            ? 'No pickup numbers match that search.'
            : bucket === 'active'
              ? 'No active pickup numbers. Click + New pickup to add one.'
              : 'No filled pickups yet — they show up here once their quota fills.'}
        </div>
      )}

      {!loading &&
        filtered.map((c) => (
          <CompanyBlock
            key={c.id}
            company={c}
            expanded={effectivelyExpanded(c.id)}
            forceExpanded={searchLower.length > 0}
            onToggleCompany={() => toggleCompany(c.id)}
            openPickupId={openPickupId}
            setOpenPickupId={setOpenPickupId}
            onRefresh={load}
          />
        ))}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New pickup number"
      >
        <NewPickupForm
          companies={companies}
          onCancel={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await load();
          }}
        />
      </Modal>
    </div>
  );
}

function CompanyBlock({
  company,
  expanded,
  forceExpanded,
  onToggleCompany,
  openPickupId,
  setOpenPickupId,
  onRefresh,
}: {
  company: Company;
  expanded: boolean;
  forceExpanded: boolean;
  onToggleCompany: () => void;
  openPickupId: number | null;
  setOpenPickupId: (n: number | null) => void;
  onRefresh: () => void;
}) {
  return (
    <section className={styles.companyGroup} data-expanded={expanded}>
      <button
        type="button"
        className={styles.companyHead}
        onClick={onToggleCompany}
        disabled={forceExpanded}
        aria-expanded={expanded}
      >
        <span className={styles.companyTitle}>{company.company}</span>
        <span className={styles.companyCount}>
          {company.numbers.length} pickup
          {company.numbers.length === 1 ? '' : 's'}
        </span>
        <span className={styles.companyChev} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <div className={styles.releaseList}>
          {company.numbers.map((p) => (
            <PickupRow
              key={p.pickup_id}
              pickup={p}
              open={openPickupId === p.pickup_id}
              onToggle={() =>
                setOpenPickupId(openPickupId === p.pickup_id ? null : p.pickup_id)
              }
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PickupRow({
  pickup,
  open,
  onToggle,
  onRefresh,
}: {
  pickup: PickupNumber;
  open: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingQuota, setEditingQuota] = useState(false);
  const [quotaDraft, setQuotaDraft] = useState(String(pickup.pickup_count));
  const [quotaBusy, setQuotaBusy] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const saveQuota = async () => {
    const n = Number(quotaDraft);
    if (!Number.isInteger(n) || n < 1) {
      setQuotaError('Quota must be a whole number ≥ 1.');
      return;
    }
    setQuotaBusy(true);
    setQuotaError(null);
    try {
      const res = await fetch(`/api/v2/pickup/${pickup.pickup_id}/quota`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickup_count: n }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? 'Quota update failed');
      }
      setEditingQuota(false);
      onRefresh();
    } catch (e) {
      setQuotaError(e instanceof Error ? e.message : 'Quota update failed');
    } finally {
      setQuotaBusy(false);
    }
  };

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v2/pickup/${pickup.pickup_id}/assignments`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Something went wrong');
        const body = (await res.json()) as AssignmentsApi;
        if (!cancelled) {
          setAssignments(body.data.assignments);
          setLoaded(true);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded, pickup.pickup_id]);

  const quota = pickup.pickup_count;
  const used = pickup.assignment_count;
  const isFilled = pickup.is_complete || used >= quota;
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;

  return (
    <div className={styles.release} data-open={open}>
      <button type="button" className={styles.releaseHead} onClick={onToggle}>
        <span className={styles.releaseValue}>{pickup.pickup_number}</span>
        <span className={styles.releaseMeta}>
          <span
            className={`${styles.fillCounter} ${
              isFilled ? styles.fillCounterFull : ''
            }`}
          >
            {used} / {quota}
          </span>
        </span>
        <span className={styles.chev}>{open ? 'Close' : 'Manage ›'}</span>
      </button>
      {open && (
        <div className={styles.releaseBody}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.quotaRow}>
            {editingQuota ? (
              <>
                <input
                  type="number"
                  min={1}
                  className={styles.quotaInput}
                  value={quotaDraft}
                  onChange={(e) => setQuotaDraft(e.target.value)}
                  disabled={quotaBusy}
                  autoFocus
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={saveQuota}
                  disabled={quotaBusy}
                >
                  {quotaBusy ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingQuota(false);
                    setQuotaDraft(String(pickup.pickup_count));
                    setQuotaError(null);
                  }}
                  disabled={quotaBusy}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <span className={styles.quotaLabel}>
                  Quota {used} / {quota}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuotaDraft(String(pickup.pickup_count));
                    setEditingQuota(true);
                    setQuotaError(null);
                  }}
                >
                  Edit quota
                </Button>
              </>
            )}
          </div>
          {quotaError && <div className={styles.error}>{quotaError}</div>}

          <div className={styles.progressOuter}>
            <div
              className={styles.progressInner}
              style={{ width: `${pct}%` }}
              aria-label={`${used} of ${quota} boxes assigned`}
            />
          </div>

          <div className={styles.subSection}>
            <div className={styles.subSectionHead}>Assigned boxes</div>
            {!loaded ? (
              <div className={styles.emptySoft}>Loading…</div>
            ) : assignments.length === 0 ? (
              <div className={styles.emptySoft}>
                No boxes assigned under this pickup yet.
              </div>
            ) : (
              <table className={styles.invTable}>
                <thead>
                  <tr>
                    <th>Unit #</th>
                    <th>Customer</th>
                    <th>Size</th>
                    <th>State</th>
                    <th>Damage at pickup</th>
                    <th>Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((r) => (
                    <tr key={r.sh_inventory_id}>
                      <td className={styles.invUnit}>{r.unit_number.trim()}</td>
                      <td>{r.customer_label ?? '—'}</td>
                      <td>{r.size}</td>
                      <td>
                        <span className={styles.stateBadge} data-state={r.state}>
                          {STATE_LABELS[r.state] ?? r.state}
                        </span>
                      </td>
                      <td>{r.pickup_damage ?? '—'}</td>
                      <td>
                        {new Date(r.assigned_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface CreatePickupResponse {
  data: Array<{ pickup_number_id: number }>;
}

function NewPickupForm({
  companies,
  onCancel,
  onCreated,
}: {
  companies: Company[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [companyId, setCompanyId] = useState<number | 'new' | ''>('');
  const [newCompany, setNewCompany] = useState('');
  const [pickupNumber, setPickupNumber] = useState('');
  const [count, setCount] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!pickupNumber.trim()) {
      setError('Pickup number is required.');
      return;
    }
    const numericCount = Number(count);
    if (!Number.isInteger(numericCount) || numericCount < 1) {
      setError('Count must be a whole number ≥ 1.');
      return;
    }
    setSubmitting(true);
    try {
      let resolvedCompanyId: number;
      if (companyId === 'new') {
        if (!newCompany.trim()) {
          setError('New company name is required.');
          setSubmitting(false);
          return;
        }
        const compRes = await fetch('/api/v2/pickup/company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: newCompany.trim() }),
        });
        if (!compRes.ok) throw new Error('Could not create the company');
        const listRes = await fetch('/api/v2/pickup', { credentials: 'include' });
        const list = (await listRes.json()) as PickupsApi;
        const created = list.data.pickups.find(
          (c) => c.company.toLowerCase() === newCompany.trim().toLowerCase(),
        );
        if (!created) throw new Error('Created the company but lost track of it');
        resolvedCompanyId = created.id;
      } else if (typeof companyId === 'number') {
        resolvedCompanyId = companyId;
      } else {
        setError('Pick a company.');
        setSubmitting(false);
        return;
      }
      const res = await fetch('/api/v2/pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          company_id: resolvedCompanyId,
          number: pickupNumber.trim().toUpperCase(),
          pickup_count: numericCount,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? 'Create failed');
      }
      const body = (await res.json()) as CreatePickupResponse;
      void body;
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.addForm}>
      <label className={styles.addLabel}>Company</label>
      <select
        className={styles.formInput}
        value={companyId}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'new') setCompanyId('new');
          else if (v === '') setCompanyId('');
          else setCompanyId(Number(v));
        }}
      >
        <option value="" disabled>
          Pick a company
        </option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.company}
          </option>
        ))}
        <option value="new">+ Add new company…</option>
      </select>

      {companyId === 'new' && (
        <>
          <label className={styles.addLabel}>New company name</label>
          <input
            type="text"
            className={styles.formInput}
            value={newCompany}
            onChange={(e) => setNewCompany(e.target.value)}
            placeholder="e.g. SeaCube"
          />
        </>
      )}

      <label className={styles.addLabel}>Pickup number</label>
      <input
        type="text"
        className={styles.formInput}
        value={pickupNumber}
        onChange={(e) => setPickupNumber(e.target.value.toUpperCase())}
        placeholder="e.g. PU-12345"
        autoCapitalize="characters"
      />

      <label className={styles.addLabel}>How many boxes does it cover?</label>
      <input
        type="number"
        className={styles.formInput}
        min="1"
        value={count}
        onChange={(e) => setCount(e.target.value)}
      />

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.modalActions}>
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create pickup'}
        </Button>
      </div>
    </div>
  );
}
