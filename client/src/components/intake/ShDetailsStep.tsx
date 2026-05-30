import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './IntakeForm.module.css';
import {
  SIZE_DATALIST_ID,
  useSizePresetLabels,
} from '../forms/sizePresets';
import {
  DAMAGE_DATALIST_ID,
  useDamagePresetLabels,
} from '../forms/damagePresets';
import type { ReleaseOption } from './SalesDetailsStep';

export interface ShIntakeForm {
  unit_number: string;
  size: string;
  damage: string;
  release_number_id: number | null;
  notes: string;
}

interface Props {
  value: ShIntakeForm;
  onChange: (patch: Partial<ShIntakeForm>) => void;
  /** When set, the release picker is locked to this release — the
   *  unit_number matched a pre-loaded container (sales parity). */
  lockedRelease?: {
    release_number_id: number;
    release_number_value: string;
    sale_company_name: string;
  } | null;
  onLoadError?: (msg: string) => void;
}

// Storage intake details (migration 0020 + 0021). Customer + billing
// mode + rates are deferred to admin audit. Release picker mirrors
// sales exactly — required at intake, auto-locked when the unit
// number matches a pre-loaded container in the release enumeration.
export function ShDetailsStep({ value, onChange, lockedRelease, onLoadError }: Props) {
  const { t } = useTranslation();
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(true);
  const sizeLabels = useSizePresetLabels();
  const damageLabels = useDamagePresetLabels();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/release/numbers', {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`Something went wrong`);
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
      <h2 className={styles.h2}>{t('sh_details.heading')}</h2>

      <div className={styles.readonlyLine}>
        <span>{t('sh_details.unit')}</span>
        <span>{value.unit_number || '—'}</span>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>{t('sh_details.size')}</span>
          <input
            type="text"
            list={SIZE_DATALIST_ID}
            value={value.size}
            onChange={(e) => onChange({ size: e.target.value })}
            placeholder={t('sh_details.size_placeholder')}
            inputMode="text"
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('sh_details.damage')}</span>
          <input
            type="text"
            list={DAMAGE_DATALIST_ID}
            value={value.damage}
            onChange={(e) => onChange({ damage: e.target.value })}
            placeholder={t('sh_details.damage_placeholder')}
            inputMode="text"
          />
        </label>
      </div>

      <datalist id={SIZE_DATALIST_ID}>
        {sizeLabels.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <datalist id={DAMAGE_DATALIST_ID}>
        {damageLabels.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      {lockedRelease ? (
        <div className={styles.readonlyLine}>
          <span>{t('sales_details.release')}</span>
          <span>
            {lockedRelease.release_number_value}
            {lockedRelease.sale_company_name
              ? ` (${lockedRelease.sale_company_name})`
              : ''}
          </span>
        </div>
      ) : (
        <label className={styles.field}>
          <span className={styles.label}>{t('sales_details.release')}</span>
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
              {loadingReleases ? t('common.loading') : t('sales_details.release_placeholder')}
            </option>
            {releases.map((r) => (
              <option key={r.release_number_id} value={r.release_number_id}>
                {t('sales_details.release_option', {
                  release: r.release_number_value,
                  count: r.release_number_count,
                })}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={styles.field}>
        <span className={styles.label}>{t('sh_details.notes')}</span>
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          placeholder={t('sh_details.notes_placeholder')}
        />
      </label>
    </div>
  );
}
