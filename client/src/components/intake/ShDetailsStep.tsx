import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './IntakeForm.module.css';

export interface ShIntakeForm {
  client_id: number | null;
  unit_number: string;
  size: string;
  damage: string;
  notes: string;
}

export interface ClientOption {
  id: number;
  client_name: string;
  business_name: string | null;
}

interface Props {
  value: ShIntakeForm;
  onChange: (patch: Partial<ShIntakeForm>) => void;
  onLoadError?: (msg: string) => void;
}

// Storage intake details (PR 2.8.1). Rates moved to the audit screen —
// yard staff doesn't see them. Server fills client.default_* into the
// row on insert; admin confirms or overrides during audit.
export function ShDetailsStep({ value, onChange, onLoadError }: Props) {
  const { t } = useTranslation();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/clients', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { data: { clients: ClientOption[] } };
        if (!cancelled) setClients(body.data.clients);
      } catch (e) {
        if (!cancelled) onLoadError?.(e instanceof Error ? e.message : 'Load failed');
      } finally {
        if (!cancelled) setLoadingClients(false);
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

      <label className={styles.field}>
        <span className={styles.label}>{t('sh_details.customer')}</span>
        <select
          value={value.client_id ?? ''}
          onChange={(e) =>
            onChange({ client_id: e.target.value ? Number(e.target.value) : null })
          }
          disabled={loadingClients}
          required
        >
          <option value="" disabled>
            {loadingClients ? t('common.loading') : t('sh_details.customer_placeholder')}
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.client_name}
              {c.business_name ? ` — ${c.business_name}` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>{t('sh_details.size')}</span>
          <input
            type="text"
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
            value={value.damage}
            onChange={(e) => onChange({ damage: e.target.value })}
            placeholder={t('sh_details.damage_placeholder')}
            inputMode="text"
          />
        </label>
      </div>

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
