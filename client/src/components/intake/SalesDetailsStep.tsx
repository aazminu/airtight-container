import { useEffect, useState } from 'react';
import styles from './IntakeForm.module.css';

export interface SalesIntakeForm {
  unit_number: string;
  size: string;
  damage: string;
  trucking_company: string;
  release_number_id: number | null;
  acquisition_price: string;
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
  onLoadError?: (msg: string) => void;
}

/**
 * Sales intake details — real form replacing the legacy AddForm. Pulls
 * active releases (is_complete=false) from /api/v2/release/numbers and
 * lets the user pick one. acceptance_number / sale_company text inputs
 * are gone — release_number_id is the only source of truth now (sale
 * company is inherited from the release's sale_company_id by the POST).
 */
export function SalesDetailsStep({ value, onChange, onLoadError }: Props) {
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

      <label className={styles.field}>
        <span className={styles.label}>Unit number</span>
        <input
          type="text"
          value={value.unit_number}
          onChange={(e) => onChange({ unit_number: e.target.value.toUpperCase() })}
          placeholder="e.g. DRYU1234567"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Size</span>
          <input
            type="text"
            value={value.size}
            onChange={(e) => onChange({ size: e.target.value })}
            placeholder="20ft / 40HC"
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Acquisition price</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.acquisition_price}
            onChange={(e) => onChange({ acquisition_price: e.target.value })}
            placeholder="$"
          />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Damage / condition</span>
        <input
          type="text"
          value={value.damage}
          onChange={(e) => onChange({ damage: e.target.value })}
          placeholder="As-is / WWT / minor dent rear door / etc."
          required
        />
      </label>

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
            {loadingReleases ? 'Loading…' : 'Select a release number'}
          </option>
          {releases.map((r) => (
            <option key={r.release_number_id} value={r.release_number_id}>
              {r.release_number_value} ({r.release_number_count} left)
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Trucking company</span>
        <input
          type="text"
          value={value.trucking_company}
          onChange={(e) => onChange({ trucking_company: e.target.value })}
          placeholder="Inbound trucker (optional)"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Notes</span>
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          placeholder="Anything else worth flagging for the audit"
        />
      </label>
    </div>
  );
}
