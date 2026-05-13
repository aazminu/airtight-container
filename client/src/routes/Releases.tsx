import { useEffect, useState } from 'react';
import { Button } from '../components/ui';
import styles from './Releases.module.css';

interface ReleaseNumber {
  release_id: number;
  release_count: number;
  release_number: string;
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

interface ReleasesApi {
  data: { releases: Company[] };
}

interface ContainersApi {
  data: { containers: Container[] };
}

// Admin page for enumerating containers under a release (PR 2.8).
// Releases are grouped by sale company; click a release to expand and
// see / edit the pre-loaded container numbers. Intake auto-associates
// on insert — server-side — so there's no separate "mark used" UI here.
export default function Releases() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/release', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as ReleasesApi;
      setCompanies(body.data.releases.filter((c) => c.numbers.length > 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Releases</h1>
        <p className={styles.subtitle}>
          Pre-load specific container numbers under each active release so
          intake can auto-match incoming boxes.
        </p>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {loading && <p>Loading…</p>}

      {!loading &&
        companies.map((c) => (
          <section key={c.id} className={styles.companyGroup}>
            <h2 className={styles.companyTitle}>{c.company}</h2>
            <div className={styles.releaseList}>
              {c.numbers.map((r) => (
                <ReleaseRow
                  key={r.release_id}
                  release={r}
                  open={openId === r.release_id}
                  onToggle={() =>
                    setOpenId(openId === r.release_id ? null : r.release_id)
                  }
                />
              ))}
            </div>
          </section>
        ))}
    </div>
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
  const [containers, setContainers] = useState<Container[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addText, setAddText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v2/release/${release.release_id}/containers`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ContainersApi;
        if (!cancelled) {
          setContainers(body.data.containers);
          setLoaded(true);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded, release.release_id]);

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
      // Re-fetch — merge handles ON CONFLICT silently dropped duplicates.
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

  return (
    <div className={styles.release} data-open={open}>
      <button type="button" className={styles.releaseHead} onClick={onToggle}>
        <span className={styles.releaseValue}>{release.release_number}</span>
        <span className={styles.releaseMeta}>
          <span>{release.release_count} remaining</span>
          <span>
            {usedCount} / {containers.length} loaded
          </span>
        </span>
        <span className={styles.chev}>{open ? 'Close' : 'Manage ›'}</span>
      </button>
      {open && (
        <div className={styles.releaseBody}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.containersList}>
            {containers.length === 0 ? (
              <div className={styles.empty}>
                No container numbers loaded yet. Add them below.
              </div>
            ) : (
              containers.map((c) => (
                <div key={c.container_number} className={styles.containerRow}>
                  <span>{c.container_number}</span>
                  <span
                    className={styles.usedBadge}
                    data-used={c.is_used}
                  >
                    {c.is_used ? 'arrived' : 'pending'}
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
      )}
    </div>
  );
}
