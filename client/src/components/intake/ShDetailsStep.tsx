import { useEffect, useState } from 'react';
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
      <h2 className={styles.h2}>Storage details</h2>

      <div className={styles.readonlyLine}>
        <span>Unit number</span>
        <span>{value.unit_number || '—'}</span>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Customer</span>
        <select
          value={value.client_id ?? ''}
          onChange={(e) =>
            onChange({ client_id: e.target.value ? Number(e.target.value) : null })
          }
          disabled={loadingClients}
          required
        >
          <option value="" disabled>
            {loadingClients ? 'Loading…' : 'Pick a customer'}
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
            placeholder="As-is / minor dent / etc."
            inputMode="text"
          />
        </label>
      </div>

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
