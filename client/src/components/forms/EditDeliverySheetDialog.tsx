import { useEffect, useState } from 'react';
import { Button, Modal } from '../ui';
import styles from './EditDeliverySheetDialog.module.css';

// Operator-entered delivery sheet fields the editor handles. Container-
// level fields (carrier, door orientation, delivery address) live on
// the sold row and are edited via the invoice form or the
// CreateReport stepper — not here.
export interface DeliverySheetParameters {
  delivery_date?: string | null;
  onsite_contact?: string | null;
  payment_details?: string | null;
  receipt_note?: string | null;
  receipt_summary?: string | null;
  notes?: string | null;
  driver_contact?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
}

interface Props {
  open: boolean;
  reportId: number;
  initial: DeliverySheetParameters;
  onSaved: (updatedReport: { id: number; parameters: unknown; resolved_data: unknown }) => void;
  onCancel: () => void;
}

interface FormState {
  delivery_date_date: string; // YYYY-MM-DD
  delivery_date_time: string; // HH:MM
  onsite_contact: string;
  payment_details: string;
  receipt_note: string;
  receipt_summary: string;
  notes: string;
  driver_name: string;
  driver_phone: string;
  driver_email: string;
}

const splitIsoLocal = (iso: string | null | undefined): { date: string; time: string } => {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};

const toFormState = (p: DeliverySheetParameters): FormState => {
  const { date, time } = splitIsoLocal(p.delivery_date ?? null);
  return {
    delivery_date_date: date,
    delivery_date_time: time,
    onsite_contact: p.onsite_contact ?? '',
    payment_details: p.payment_details ?? '',
    receipt_note: p.receipt_note ?? '',
    receipt_summary: p.receipt_summary ?? '',
    notes: p.notes ?? '',
    driver_name: p.driver_contact?.name ?? '',
    driver_phone: p.driver_contact?.phone ?? '',
    driver_email: p.driver_contact?.email ?? '',
  };
};

const formToParameters = (f: FormState): DeliverySheetParameters => {
  let deliveryIso: string | null = null;
  if (f.delivery_date_date) {
    const time = f.delivery_date_time || '00:00';
    const local = new Date(`${f.delivery_date_date}T${time}`);
    if (!Number.isNaN(local.getTime())) deliveryIso = local.toISOString();
  }
  const driver: DeliverySheetParameters['driver_contact'] = {};
  if (f.driver_name.trim()) driver.name = f.driver_name.trim();
  if (f.driver_phone.trim()) driver.phone = f.driver_phone.trim();
  if (f.driver_email.trim()) driver.email = f.driver_email.trim();
  return {
    delivery_date: deliveryIso,
    onsite_contact: f.onsite_contact.trim() || null,
    payment_details: f.payment_details.trim() || null,
    receipt_note: f.receipt_note.trim() || null,
    receipt_summary: f.receipt_summary.trim() || null,
    notes: f.notes.trim() || null,
    driver_contact: Object.keys(driver).length > 0 ? driver : null,
  };
};

export function EditDeliverySheetDialog({
  open,
  reportId,
  initial,
  onSaved,
  onCancel,
}: Props) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the dialog reopens — drops any stale draft.
  useEffect(() => {
    if (open) {
      setForm(toFormState(initial));
      setError(null);
    }
  }, [open, initial]);

  const set = <K extends keyof FormState>(key: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/report/${reportId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parameters: formToParameters(form) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.message ?? `Save failed (${res.status})`);
      }
      onSaved(body.data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onCancel} title="Edit delivery sheet" size="md">
      <div className={styles.body}>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Delivery date</span>
            <input
              type="date"
              className={styles.input}
              value={form.delivery_date_date}
              onChange={(e) => set('delivery_date_date', e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Delivery time</span>
            <input
              type="time"
              className={styles.input}
              value={form.delivery_date_time}
              onChange={(e) => set('delivery_date_time', e.target.value)}
            />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>On-site contact</span>
          <input
            type="text"
            className={styles.input}
            value={form.onsite_contact}
            onChange={(e) => set('onsite_contact', e.target.value)}
            placeholder="John Doe · 555-0142"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Payment details</span>
          <input
            type="text"
            className={styles.input}
            value={form.payment_details}
            onChange={(e) => set('payment_details', e.target.value)}
            placeholder="Cash on delivery"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Receipt note</span>
          <input
            type="text"
            className={styles.input}
            value={form.receipt_note}
            onChange={(e) => set('receipt_note', e.target.value)}
            placeholder='"Standard delivery — call 30 minutes out."'
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Receipt summary override</span>
          <input
            type="text"
            className={styles.input}
            value={form.receipt_summary}
            onChange={(e) => set('receipt_summary', e.target.value)}
            placeholder='Defaults to "1 {size} Weather Tight Container"'
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Notes</span>
          <textarea
            className={styles.textarea}
            rows={3}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Tight driveway — back in only"
          />
        </label>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Driver name</span>
            <input
              type="text"
              className={styles.input}
              value={form.driver_name}
              onChange={(e) => set('driver_name', e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Driver phone</span>
            <input
              type="tel"
              className={styles.input}
              value={form.driver_phone}
              onChange={(e) => set('driver_phone', e.target.value)}
              placeholder="(732) 555-0142"
            />
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.label}>Driver email</span>
          <input
            type="email"
            className={styles.input}
            value={form.driver_email}
            onChange={(e) => set('driver_email', e.target.value)}
          />
        </label>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
