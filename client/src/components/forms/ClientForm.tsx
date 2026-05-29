import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { AddressFields, Button, CurrencyInput, PhoneInput } from '../ui';
import styles from './ClientForm.module.css';

export interface Client {
  id?: number;
  client_name: string;
  business_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  default_in_fee?: number | string | null;
  default_out_fee?: number | string | null;
  default_daily_rate?: number | string | null;
}

interface Props {
  initial?: Client | null;
  onSubmit: (c: Client) => Promise<void> | void;
  onCancel: () => void;
}

const empty: Client = {
  client_name: '',
  business_name: '',
  contact_email: '',
  contact_phone: '',
  street: '',
  city: '',
  state: '',
  zip: '',
  default_in_fee: 65,
  default_out_fee: 65,
  default_daily_rate: 1,
};

export function ClientForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<Client>(initial ?? empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initial ?? empty);
  }, [initial]);

  const update =
    <K extends keyof Client>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.client_name?.trim()) {
      setError('Client name is required');
      return;
    }
    if (form.contact_email && !/^\S+@\S+\.\S+$/.test(form.contact_email)) {
      setError('Email looks invalid');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handle}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.row}>
        <label className={styles.field}>
          <span>Client name *</span>
          <input
            type="text"
            value={form.client_name}
            onChange={update('client_name')}
            autoFocus
            required
          />
        </label>
        <label className={styles.field}>
          <span>Business name</span>
          <input
            type="text"
            value={form.business_name ?? ''}
            onChange={update('business_name')}
          />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          <span>Email</span>
          <input
            type="email"
            value={form.contact_email ?? ''}
            onChange={update('contact_email')}
          />
        </label>
        <label className={styles.field}>
          <span>Phone</span>
          <PhoneInput
            value={form.contact_phone ?? ''}
            onChange={(v) => setForm((f) => ({ ...f, contact_phone: v }))}
          />
        </label>
      </div>

      <fieldset className={styles.fieldset}>
        <legend>Address</legend>
        <AddressFields
          value={{
            name: '',
            street: form.street ?? '',
            city: form.city ?? '',
            state: form.state ?? '',
            zip: form.zip ?? '',
          }}
          onChange={(next) =>
            setForm((f) => ({
              ...f,
              street: next.street,
              city: next.city,
              state: next.state,
              zip: next.zip,
            }))
          }
          includeName={false}
        />
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Storage &amp; Handling rate defaults</legend>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>In fee</span>
            <CurrencyInput
              value={form.default_in_fee ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, default_in_fee: v }))}
            />
          </label>
          <label className={styles.field}>
            <span>Out fee</span>
            <CurrencyInput
              value={form.default_out_fee ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, default_out_fee: v }))}
            />
          </label>
          <label className={styles.field}>
            <span>Daily rate</span>
            <CurrencyInput
              value={form.default_daily_rate ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, default_daily_rate: v }))}
            />
          </label>
        </div>
      </fieldset>

      <div className={styles.actions}>
        <Button variant="ghost" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : initial?.id ? 'Save changes' : 'Create client'}
        </Button>
      </div>
    </form>
  );
}
