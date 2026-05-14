import { useEffect, useState } from 'react';
import styles from './IntakeForm.module.css';

export interface SalesIntakeForm {
  unit_number: string;
  size: string;
  damage: string;
  trucking_company: string;
  release_number_id: number | null;
  notes: string;
}

export interface ReleaseOption {
  release_number_id: number;
  release_number_count: number;
  release_number_value: string;
}

interface Props {
  value: SalesIntakeForm;
  onChange: (patch: Partial<SalesIntakeForm>) => void;
  /** When set, the release picker is locked to this release — the
   *  unit_number matched a pre-loaded container (PR 2.8.1). */
  lockedRelease?: { release_number_id: number; release_number_value: string; sale_company_name: string } | null;
  onLoadError?: (msg: string) => void;
}

// Sales intake details (PR 2.8.1). Admin-only fields (acquisition_price)
// moved to the audit screen. Unit number shown read-only at the top —
// it's confirmed/edited on the prior Confirm step. Release picker is
// locked when an auto-match landed.
export function SalesDetailsStep({ value, onChange, lockedRelease, onLoadError }: Props) {
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/release/numbers', {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { data: { releases: ReleaseOption[] } };
        if (!cancelled) setReleases(body.data.releases);
      } catch (e) {
        if (!cancelled) onLoadError?.(e instanceof Error ? e.message : 'Load failed');
      } finally {
        if (!cancelled) setLoadingReleases(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onLoadError]);

  return (
    <div className={styles.form}>
      <h2 className={styles.h2}>Container details</h2>

      <div className={styles.readonlyLine}>
        <span>Unit number</span>
        <span>{value.unit_number || '—'}</span>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Size</span>
        <input
          type="text"
          value={value.size}
          onChange={(e) => onChange({ size: e.target.value })}
          placeholder="20ft / 40ft / 40HC"
          inputMode="text"
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Damage / condition</span>
        <input
          type="text"
          value={value.damage}
          onChange={(e) => onChange({ damage: e.target.value })}
          placeholder="As-is / minor dent rear door / etc."
          inputMode="text"
          required
        />
      </label>

      {lockedRelease ? (
        <div className={styles.readonlyLine}>
          <span>Release</span>
          <span>
            {lockedRelease.release_number_value}
            {lockedRelease.sale_company_name
              ? ` (${lockedRelease.sale_company_name})`
              : ''}
          </span>
        </div>
      ) : (
        <label className={styles.field}>
          <span className={styles.label}>Release</span>
          <select
            value={value.release_number_id ?? ''}
            onChange={(e) =>
              onChange({
                release_number_id: e.target.value ? Number(e.target.value) : null,
              })
            }
            disabled={loadingReleases}
            required
          >
            <option value="" disabled>
              {loadingReleases ? 'Loading…' : 'Pick a release'}
            </option>
            {releases.map((r) => (
              <option key={r.release_number_id} value={r.release_number_id}>
                {r.release_number_value} ({r.release_number_count} left)
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={styles.field}>
        <span className={styles.label}>Trucking company</span>
        <input
          type="text"
          value={value.trucking_company}
          onChange={(e) => onChange({ trucking_company: e.target.value })}
          placeholder="Who hauled it in (optional)"
          autoComplete="organization"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Notes</span>
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          placeholder="Anything else worth flagging"
        />
      </label>
    </div>
  );
}
