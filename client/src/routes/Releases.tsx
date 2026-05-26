import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '../components/ui';
import styles from './Releases.module.css';

type Bucket = 'active' | 'filled';

interface ReleaseNumber {
  release_id: number;
  release_count: number;          // quota
  release_number: string;
  inventory_count: number;        // boxes actually logged under this release
}

interface Company {
  id: number;
  company: string;
  numbers: ReleaseNumber[];
}

interface Container {
  container_number: string;
  is_used: boolean;
}

interface InventoryUnderRelease {
  id: number;
  unit_number: string;
  size: string;
  damage: string | null;
  state: string;
  intake_date: string;
  outbound_date: string | null;
  destination: string | null;
  invoice_id: number | null;
  invoice_number: number | null;
  buyer_label: string | null;
}

interface ReleasesApi {
  data: { releases: Company[] };
}

interface ContainersApi {
  data: { containers: Container[] };
}

interface InventoryApi {
  data: { containers: InventoryUnderRelease[] };
}

const STATE_LABELS: Record<string, string> = {
  available: 'Available',
  hold: 'On hold',
  sold: 'Sold',
  outbound: 'Outbound',
  pending: 'Pending audit',
};

// Admin page for releases. Two tabs: Active (filled_count < quota) and
// Filled (filled_count >= quota). Both tabs include the same per-release
// drawer: pre-load list (intake auto-match) and a real "In yard"
// inventory list that powers the release_summary PDF.
export default function Releases() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openReleaseId, setOpenReleaseId] = useState<number | null>(null);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<number>>(
    new Set(),
  );
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [bucket, setBucket] = useState<Bucket>('active');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/release', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as ReleasesApi;
      setCompanies(body.data.releases);
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

  // Bucket math: a release is "filled" when actual inventory count >=
  // quota. Sold/outbound boxes still count toward filled (the resolver
  // doesn't filter by state).
  const isFilled = (r: ReleaseNumber) => r.inventory_count >= r.release_count;

  const bucketCounts = useMemo(() => {
    let active = 0;
    let filled = 0;
    for (const c of companies) {
      for (const r of c.numbers) {
        if (isFilled(r)) filled++;
        else active++;
      }
    }
    return { active, filled };
  }, [companies]);

  const filtered = useMemo<Company[]>(() => {
    return companies
      .map((c) => ({
        ...c,
        numbers: c.numbers.filter((r) => {
          if (bucket === 'active' && isFilled(r)) return false;
          if (bucket === 'filled' && !isFilled(r)) return false;
          if (!searchLower) return true;
          return r.release_number.toLowerCase().includes(searchLower);
        }),
      }))
      .filter((c) => c.numbers.length > 0);
  }, [companies, searchLower, bucket]);

  // Auto-open companies that have matching releases under search.
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
            <h1 className={styles.title}>Releases</h1>
            <p className={styles.subtitle}>
              Pre-load container numbers under each release so intake auto-matches.
              Click a release to see the boxes that actually came in.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>+ New release</Button>
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
          placeholder="Search release numbers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {loading && <p>Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div className={styles.empty}>
          {searchLower
            ? 'No releases match that search.'
            : bucket === 'active'
              ? 'No active releases. Click + New release to add one.'
              : 'No filled releases yet — boxes will show up here once a release hits its quota.'}
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
            openReleaseId={openReleaseId}
            setOpenReleaseId={setOpenReleaseId}
          />
        ))}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New release"
      >
        <NewReleaseForm
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
  openReleaseId,
  setOpenReleaseId,
}: {
  company: Company;
  expanded: boolean;
  forceExpanded: boolean;
  onToggleCompany: () => void;
  openReleaseId: number | null;
  setOpenReleaseId: (n: number | null) => void;
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
          {company.numbers.length} release
          {company.numbers.length === 1 ? '' : 's'}
        </span>
        <span className={styles.companyChev} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <div className={styles.releaseList}>
          {company.numbers.map((r) => (
            <ReleaseRow
              key={r.release_id}
              release={r}
              open={openReleaseId === r.release_id}
              onToggle={() =>
                setOpenReleaseId(openReleaseId === r.release_id ? null : r.release_id)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ReleaseRow({
  release,
  open,
  onToggle,
}: {
  release: ReleaseNumber;
  open: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const [containers, setContainers] = useState<Container[]>([]);
  const [inventory, setInventory] = useState<InventoryUnderRelease[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addText, setAddText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const [preRes, invRes] = await Promise.all([
          fetch(`/api/v2/release/${release.release_id}/containers`, {
            credentials: 'include',
          }),
          fetch(`/api/v2/release/${release.release_id}/inventory`, {
            credentials: 'include',
          }),
        ]);
        if (!preRes.ok) throw new Error(`HTTP ${preRes.status}`);
        if (!invRes.ok) throw new Error(`HTTP ${invRes.status}`);
        const preBody = (await preRes.json()) as ContainersApi;
        const invBody = (await invRes.json()) as InventoryApi;
        if (!cancelled) {
          setContainers(preBody.data.containers);
          setInventory(invBody.data.containers);
          setLoaded(true);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded, release.release_id]);

  const generateReport = async () => {
    setReportBusy(true);
    setReportError(null);
    try {
      const res = await fetch('/api/v2/report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_type: 'release_summary',
          parameters: { release_id: release.release_id },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      const reportId = body?.data?.report?.id;
      if (reportId) navigate(`/reports/${reportId}`);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : 'Report failed');
    } finally {
      setReportBusy(false);
    }
  };

  const addContainers = async () => {
    const numbers = addText
      .split(/[\n,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (numbers.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/release/${release.release_id}/containers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ numbers }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAddText('');
      const re = await fetch(
        `/api/v2/release/${release.release_id}/containers`,
        { credentials: 'include' },
      );
      const body = (await re.json()) as ContainersApi;
      setContainers(body.data.containers);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setSubmitting(false);
    }
  };

  const removeContainer = async (number: string) => {
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/release/${release.release_id}/containers/${encodeURIComponent(number)}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setContainers((cs) => cs.filter((c) => c.container_number !== number));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    }
  };

  const usedCount = containers.filter((c) => c.is_used).length;
  const quota = release.release_count;
  const filled = release.inventory_count;
  const isFilled = filled >= quota;
  const pct = quota > 0 ? Math.min(100, (filled / quota) * 100) : 0;

  return (
    <div className={styles.release} data-open={open}>
      <button type="button" className={styles.releaseHead} onClick={onToggle}>
        <span className={styles.releaseValue}>{release.release_number}</span>
        <span className={styles.releaseMeta}>
          <span
            className={`${styles.fillCounter} ${
              isFilled ? styles.fillCounterFull : ''
            }`}
          >
            {filled} / {quota}
          </span>
          <span className={styles.releaseMetaSub}>
            {usedCount}/{containers.length} pre-loaded
          </span>
        </span>
        <span className={styles.chev}>{open ? 'Close' : 'Manage ›'}</span>
      </button>
      {open && (
        <div className={styles.releaseBody}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.progressOuter}>
            <div
              className={styles.progressInner}
              style={{ width: `${pct}%` }}
              aria-label={`${filled} of ${quota} containers logged`}
            />
          </div>

          {reportError && <div className={styles.error}>{reportError}</div>}
          <div className={styles.actionsRow}>
            <Button
              variant="primary"
              onClick={generateReport}
              disabled={reportBusy}
            >
              {reportBusy ? 'Generating…' : 'Generate PDF report'}
            </Button>
          </div>

          <div className={styles.subSection}>
            <div className={styles.subSectionHead}>In yard</div>
            {!loaded ? (
              <div className={styles.emptySoft}>Loading inventory…</div>
            ) : inventory.length === 0 ? (
              <div className={styles.emptySoft}>
                No real containers have been logged under this release yet.
              </div>
            ) : (
              <table className={styles.invTable}>
                <thead>
                  <tr>
                    <th>Unit #</th>
                    <th>Size</th>
                    <th>State</th>
                    <th>Intake</th>
                    <th>Outbound</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((r) => (
                    <tr key={r.id}>
                      <td className={styles.invUnit}>
                        {r.unit_number.trim()}
                      </td>
                      <td>{r.size}</td>
                      <td>
                        <span
                          className={styles.stateBadge}
                          data-state={r.state}
                        >
                          {STATE_LABELS[r.state] ?? r.state}
                        </span>
                      </td>
                      <td>
                        {new Date(r.intake_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td>
                        {r.outbound_date
                          ? new Date(r.outbound_date).toLocaleDateString(
                              'en-US',
                              {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              },
                            )
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className={styles.subSection}>
            <div className={styles.subSectionHead}>
              Pre-loaded container numbers
            </div>
            <p className={styles.subSectionHint}>
              Operator-typed list used to auto-match incoming containers at
              intake. Independent of the in-yard list above — pre-loaded
              numbers may not have arrived yet.
            </p>
            <div className={styles.containersList}>
              {containers.length === 0 ? (
                <div className={styles.emptySoft}>
                  No container numbers pre-loaded yet. Add them below.
                </div>
              ) : (
                containers.map((c) => (
                  <div key={c.container_number} className={styles.containerRow}>
                    <span>{c.container_number}</span>
                    <span className={styles.usedBadge} data-used={c.is_used}>
                      {c.is_used ? 'arrived' : 'waiting'}
                    </span>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeContainer(c.container_number)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className={styles.addForm}>
              <label className={styles.addLabel}>
                Add container numbers (one per line or comma-separated)
              </label>
              <textarea
                className={styles.addTextarea}
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                placeholder="MSCU1234567&#10;TRHU2174232"
                spellCheck={false}
              />
              <div className={styles.addActions}>
                <Button
                  variant="primary"
                  onClick={addContainers}
                  disabled={submitting || addText.trim() === ''}
                >
                  {submitting ? 'Adding…' : 'Add'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CreateReleaseResponse {
  data: Array<{ release_number_id: number }>;
}

function parseContainerNumbers(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,]+/)) {
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function NewReleaseForm({
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
  const [releaseNumber, setReleaseNumber] = useState('');
  const [count, setCount] = useState('1');
  const [countTouched, setCountTouched] = useState(false);
  const [containerText, setContainerText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedNumbers = useMemo(
    () => parseContainerNumbers(containerText),
    [containerText],
  );

  // Auto-track count to parsed numbers until the admin types in the count
  // field themselves — then we stop nudging.
  useEffect(() => {
    if (countTouched) return;
    if (parsedNumbers.length === 0) return;
    setCount(String(parsedNumbers.length));
  }, [parsedNumbers.length, countTouched]);

  const submit = async () => {
    setError(null);
    if (!releaseNumber.trim()) {
      setError('Release number is required.');
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
        const compRes = await fetch('/api/v2/release/company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: newCompany.trim() }),
        });
        if (!compRes.ok) throw new Error('Could not create the company');
        // The existing POST /company route doesn't return the new id,
        // so re-fetch the releases list and look it up by name. Cheap.
        const listRes = await fetch('/api/v2/release', { credentials: 'include' });
        const list = (await listRes.json()) as ReleasesApi;
        const created = list.data.releases.find(
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
      const res = await fetch('/api/v2/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          company_id: resolvedCompanyId,
          number: releaseNumber.trim().toUpperCase(),
          box_count: numericCount,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as CreateReleaseResponse;
      const newId = body.data?.[0]?.release_number_id;
      if (parsedNumbers.length > 0 && typeof newId === 'number') {
        const addRes = await fetch(`/api/v2/release/${newId}/containers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ numbers: parsedNumbers }),
        });
        if (!addRes.ok) {
          throw new Error(
            'Release created, but container numbers failed to attach. Open the release to add them manually.',
          );
        }
      }
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

      <label className={styles.addLabel}>Release number</label>
      <input
        type="text"
        className={styles.formInput}
        value={releaseNumber}
        onChange={(e) => setReleaseNumber(e.target.value.toUpperCase())}
        placeholder="e.g. ABC1234"
        autoCapitalize="characters"
      />

      <label className={styles.addLabel}>How many containers does it cover?</label>
      <input
        type="number"
        className={styles.formInput}
        min="1"
        value={count}
        onChange={(e) => {
          setCountTouched(true);
          setCount(e.target.value);
        }}
      />

      <label className={styles.addLabel}>
        Container numbers (optional — one per line or comma-separated)
      </label>
      <textarea
        className={styles.addTextarea}
        value={containerText}
        onChange={(e) => setContainerText(e.target.value)}
        placeholder="MSCU1234567&#10;TRHU2174232"
        spellCheck={false}
      />
      {parsedNumbers.length > 0 && (
        <div className={styles.parsedHint}>
          {parsedNumbers.length} number{parsedNumbers.length === 1 ? '' : 's'}{' '}
          will be attached on create.
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.modalActions}>
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create release'}
        </Button>
      </div>
    </div>
  );
}
