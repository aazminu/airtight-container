import { useEffect, useState } from 'react';
import styles from './IntakeForm.module.css';

export interface ShIntakeForm {
  client_id: number | null;
  unit_number: string;
  size: string;
  damage: string;
  in_fee: string;
  out_fee: string;
  daily_rate: string;
  notes: string;
}

export interface ClientOption {
  id: number;
  client_name: string;
  business_name: string | null;
  default_in_fee: string;
  default_out_fee: string;
  default_daily_rate: string;
}

interface Props {
  value: ShIntakeForm;
  onChange: (patch: Partial<ShIntakeForm>) => void;
  onLoadError?: (msg: string) => void;
}

// Picking a client pre-fills the three rate fields from that client's defaults,
// but leaves them editable — staff confirms or overrides at intake; admin audit
// (PR 2.5) gets a second pass. This matches PLAN §4.2: rates are snapshotted
// onto the sh_inventory row at intake, not derived later.
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

  const pickClient = (id: number | null) => {
    if (id === null) {
      onChange({ client_id: null });
      return;
    }
    const c = clients.find((c) => c.id === id);
    if (!c) {
      onChange({ client_id: id });
      return;
    }
    onChange({
      client_id: id,
      in_fee: c.default_in_fee,
      out_fee: c.default_out_fee,
      daily_rate: c.default_daily_rate,
    });
  };

  return (
    <div className={styles.form}>
      <h2 className={styles.h2}>Storage details</h2>

      <label className={styles.field}>
        <span className={styles.label}>Client</span>
        <select
          value={value.client_id ?? ''}
          onChange={(e) => pickClient(e.target.value ? Number(e.target.value) : null)}
          disabled={loadingClients}
          required
        >
          <option value="" disabled>
            {loadingClients ? 'Loading…' : 'Select a client'}
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.client_name}
              {c.business_name ? ` — ${c.business_name}` : ''}
            </option>
          ))}
        </select>
      </label>

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
          <span className={styles.label}>Damage / condition</span>
          <input
            type="text"
            value={value.damage}
            onChange={(e) => onChange({ damage: e.target.value })}
            placeholder="As-is / minor dent / etc."
          />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>In fee ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.in_fee}
            onChange={(e) => onChange({ in_fee: e.target.value })}
            placeholder="65"
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Out fee ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.out_fee}
            onChange={(e) => onChange({ out_fee: e.target.value })}
            placeholder="65"
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Daily rate ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.daily_rate}
            onChange={(e) => onChange({ daily_rate: e.target.value })}
            placeholder="1"
            required
          />
        </label>
      </div>

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
