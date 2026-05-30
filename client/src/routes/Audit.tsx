import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  CurrencyInput,
  Modal,
  PhotoLightbox,
  UnitNumberInput,
} from '../components/ui';
import styles from './Audit.module.css';

interface UnitRenameConflict {
  old_unit: string;
  new_unit: string;
  old_unit_in_current_release: boolean;
  current_release: {
    release_number_value: string;
    sale_company_name: string | null;
  } | null;
  new_unit_linked_release: {
    release_number_value: string;
    sale_company_name: string | null;
    is_other_release: boolean;
  } | null;
}

interface PendingSalesBox {
  id: number;
  unit_number: string;
  size: string;
  damage: string;
  trucking_company: string | null;
  acquisition_price: string | null;
  date: string;
  notes: string | null;
  photo_urls: string[] | null;
}

type ShBillingMode = 'in_out_daily' | 'flat_monthly' | 'non_billable';

interface PendingShBox {
  id: number;
  // Null until audit assigns a client (migration 0020).
  client_id: number | null;
  client_name?: string | null;
  business_name?: string | null;
  // Release/manifest the box arrived on (migration 0021).
  release_number_id: number | null;
  release_number_value?: string | null;
  sale_company_name?: string | null;
  unit_number: string;
  size: string;
  damage: string | null;
  billing_mode: ShBillingMode;
  in_fee: string | null;
  out_fee: string | null;
  daily_rate: string | null;
  flat_rate: string | null;
  intake_date: string;
  notes: string | null;
  photo_urls: string[] | null;
}

interface ClientPickerOption {
  id: number;
  client_name: string;
  business_name: string | null;
}

interface SalesEdit {
  unit_number: string;
  size: string;
  damage: string;
  trucking_company: string;
  acquisition_price: string;
  date: string;
  notes: string;
}

interface ShEdit {
  client_id: number | null;
  billing_mode: ShBillingMode;
  unit_number: string;
  size: string;
  damage: string;
  in_fee: string;
  out_fee: string;
  daily_rate: string;
  flat_rate: string;
  intake_date: string;
  notes: string;
}

const isoToLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const localInputToIso = (v: string): string | null => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

// Admin pending-audit screen. Every intake field is editable here
// (PR 2.8.1); yard staff no longer collects rates / acquisition price
// during intake. Clicking a photo opens a fullscreen lightbox.
export default function Audit() {
  const [sales, setSales] = useState<PendingSalesBox[]>([]);
  const [sh, setSh] = useState<PendingShBox[]>([]);
  const [clients, setClients] = useState<ClientPickerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [salesRes, shRes, clientsRes] = await Promise.all([
        fetch('/api/v1/inventory?pending_audit=true', { credentials: 'include' }),
        fetch('/api/v2/sh-inventory?state=pending', { credentials: 'include' }),
        fetch('/api/v2/clients', { credentials: 'include' }),
      ]);
      if (!salesRes.ok) throw new Error('Could not load sales boxes');
      if (!shRes.ok) throw new Error('Could not load storage boxes');
      const salesBody = (await salesRes.json()) as {
        data: { inventory: PendingSalesBox[] };
      };
      const shBody = (await shRes.json()) as { data: { boxes: PendingShBox[] } };
      setSales(salesBody.data.inventory);
      setSh(shBody.data.boxes);
      if (clientsRes.ok) {
        const cb = (await clientsRes.json()) as {
          data: { clients: ClientPickerOption[] };
        };
        setClients(cb.data.clients);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const total = sales.length + sh.length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Pending audit</h1>
        <p className={styles.subtitle}>
          {loading
            ? 'Loading…'
            : total === 0
              ? "All caught up — nothing waiting on you."
              : `${total} box${total === 1 ? '' : 'es'} waiting for review.`}
        </p>
      </header>

      {loadError && <div className={styles.error}>{loadError}</div>}

      <SalesSection
        boxes={sales}
        openKey={openKey}
        setOpenKey={setOpenKey}
        onConfirmed={(id) => {
          setSales((s) => s.filter((b) => b.id !== id));
          setOpenKey(null);
        }}
        onPhotoClick={(url) => setLightboxSrc(url)}
      />

      <ShSection
        boxes={sh}
        clients={clients}
        openKey={openKey}
        setOpenKey={setOpenKey}
        onConfirmed={(id) => {
          setSh((s) => s.filter((b) => b.id !== id));
          setOpenKey(null);
        }}
        onPhotoClick={(url) => setLightboxSrc(url)}
      />

      <PhotoLightbox
        src={lightboxSrc}
        alt="Intake photo"
        onClose={() => setLightboxSrc(null)}
      />
    </div>
  );
}

function SalesSection({
  boxes,
  openKey,
  setOpenKey,
  onConfirmed,
  onPhotoClick,
}: {
  boxes: PendingSalesBox[];
  openKey: string | null;
  setOpenKey: (k: string | null) => void;
  onConfirmed: (id: number) => void;
  onPhotoClick: (url: string) => void;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Sales</h2>
        <span className={styles.sectionCount}>{boxes.length}</span>
        <Badge tone="info">Confirm price + details</Badge>
      </div>
      {boxes.length === 0 ? (
        <div className={styles.empty}>No Sales boxes pending.</div>
      ) : (
        <div className={styles.list}>
          {boxes.map((b) => (
            <SalesRow
              key={b.id}
              box={b}
              open={openKey === `sales-${b.id}`}
              onToggle={() =>
                setOpenKey(openKey === `sales-${b.id}` ? null : `sales-${b.id}`)
              }
              onConfirmed={() => onConfirmed(b.id)}
              onPhotoClick={onPhotoClick}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ShSection({
  boxes,
  clients,
  openKey,
  setOpenKey,
  onConfirmed,
  onPhotoClick,
}: {
  boxes: PendingShBox[];
  clients: ClientPickerOption[];
  openKey: string | null;
  setOpenKey: (k: string | null) => void;
  onConfirmed: (id: number) => void;
  onPhotoClick: (url: string) => void;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Storage</h2>
        <span className={styles.sectionCount}>{boxes.length}</span>
        <Badge tone="info">Assign customer + billing</Badge>
      </div>
      {boxes.length === 0 ? (
        <div className={styles.empty}>No Storage boxes pending.</div>
      ) : (
        <div className={styles.list}>
          {boxes.map((b) => (
            <ShRow
              key={b.id}
              box={b}
              clients={clients}
              open={openKey === `sh-${b.id}`}
              onToggle={() =>
                setOpenKey(openKey === `sh-${b.id}` ? null : `sh-${b.id}`)
              }
              onConfirmed={() => onConfirmed(b.id)}
              onPhotoClick={onPhotoClick}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SalesRow({
  box,
  open,
  onToggle,
  onConfirmed,
  onPhotoClick,
}: {
  box: PendingSalesBox;
  open: boolean;
  onToggle: () => void;
  onConfirmed: () => void;
  onPhotoClick: (url: string) => void;
}) {
  const [edit, setEdit] = useState<SalesEdit>({
    unit_number: box.unit_number ?? '',
    size: box.size ?? '',
    damage: box.damage ?? '',
    trucking_company: box.trucking_company ?? '',
    acquisition_price: box.acquisition_price ?? '',
    date: isoToLocalInput(box.date),
    notes: box.notes ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameConflict, setRenameConflict] = useState<UnitRenameConflict | null>(null);

  const submit = async (confirmUnitRename = false) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/inventory/audit/${box.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          unit_number: edit.unit_number.trim() || undefined,
          size: edit.size.trim() || undefined,
          damage: edit.damage.trim() || undefined,
          trucking_company: edit.trucking_company.trim() || null,
          acquisition_price: edit.acquisition_price || null,
          date: localInputToIso(edit.date),
          notes: edit.notes || null,
          confirm_unit_rename: confirmUnitRename || undefined,
        }),
      });
      if (res.status === 409) {
        const body = (await res.json()) as {
          code?: string;
          details?: UnitRenameConflict;
        };
        if (body.code === 'unit_rename_confirm_required' && body.details) {
          setRenameConflict(body.details);
          return;
        }
      }
      if (!res.ok) throw new Error(`Something went wrong`);
      setRenameConflict(null);
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.row} data-open={open}>
      <button type="button" className={styles.rowHead} onClick={onToggle}>
        <div className={styles.rowSummary}>
          <span className={styles.rowTitle}>{box.unit_number || '(no unit number)'}</span>
          <span className={styles.rowMeta}>
            <span>{box.size}</span>
            <span>{box.damage}</span>
            {box.acquisition_price && <span>${box.acquisition_price}</span>}
            <span>Arrived {new Date(box.date).toLocaleDateString()}</span>
          </span>
        </div>
        <span className={styles.rowChev}>{open ? 'Close' : 'Review ›'}</span>
      </button>
      {open && (
        <div className={styles.rowBody}>
          <PhotoStrip urls={box.photo_urls} onPhotoClick={onPhotoClick} />
          <div className={styles.formRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Unit number</span>
              <UnitNumberInput
                value={edit.unit_number}
                onChange={(v) => setEdit((s) => ({ ...s, unit_number: v }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Size</span>
              <input
                type="text"
                value={edit.size}
                onChange={(e) => setEdit((s) => ({ ...s, size: e.target.value }))}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Damage / condition</span>
            <input
              type="text"
              value={edit.damage}
              onChange={(e) => setEdit((s) => ({ ...s, damage: e.target.value }))}
            />
          </label>
          <div className={styles.formRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Trucking company</span>
              <input
                type="text"
                value={edit.trucking_company}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, trucking_company: e.target.value }))
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Acquisition price</span>
              <CurrencyInput
                value={edit.acquisition_price}
                onChange={(v) => setEdit((s) => ({ ...s, acquisition_price: v }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Intake date</span>
              <input
                type="datetime-local"
                value={edit.date}
                onChange={(e) => setEdit((s) => ({ ...s, date: e.target.value }))}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Notes</span>
            <textarea
              rows={2}
              value={edit.notes}
              onChange={(e) => setEdit((s) => ({ ...s, notes: e.target.value }))}
            />
          </label>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.actions}>
            <Button variant="ghost" onClick={onToggle} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => submit(false)}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Save & approve'}
            </Button>
          </div>
        </div>
      )}
      <UnitRenameModal
        conflict={renameConflict}
        onCancel={() => setRenameConflict(null)}
        onConfirm={() => {
          setRenameConflict(null);
          submit(true);
        }}
        busy={submitting}
      />
    </div>
  );
}

function UnitRenameModal({
  conflict,
  onCancel,
  onConfirm,
  busy,
}: {
  conflict: UnitRenameConflict | null;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  if (!conflict) return null;
  const cur = conflict.current_release;
  const newRel = conflict.new_unit_linked_release;
  return (
    <Modal
      open={true}
      onClose={onCancel}
      title="Heads up — this rename touches release data"
      closeOnBackdropClick={!busy}
      closeOnEscape={!busy}
    >
      <div className={styles.renameModalBody}>
        <p className={styles.renameLead}>
          You’re changing the unit number from{' '}
          <code>{conflict.old_unit}</code> to <code>{conflict.new_unit}</code>.
          Saving will also update the release that this container is
          recorded against. Read the implications before continuing.
        </p>
        <ul className={styles.renameImplications}>
          {conflict.old_unit_in_current_release && cur && (
            <li>
              Release <strong>{cur.release_number_value}</strong>
              {cur.sale_company_name ? ` (${cur.sale_company_name})` : ''}{' '}
              currently has <code>{conflict.old_unit}</code> on its
              container list. Saving renames that entry to{' '}
              <code>{conflict.new_unit}</code>, so the release will no
              longer remember <code>{conflict.old_unit}</code> as one of
              its expected boxes.
            </li>
          )}
          {newRel && (
            <li>
              <code>{conflict.new_unit}</code> is already listed under
              release <strong>{newRel.release_number_value}</strong>
              {newRel.sale_company_name
                ? ` (${newRel.sale_company_name})`
                : ''}
              {newRel.is_other_release
                ? '. This container is currently assigned to a different release — saving will not reassign it. If the box actually arrived under that other release, cancel and re-intake it under the correct release.'
                : '.'}
            </li>
          )}
        </ul>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Saving…' : 'Rename anyway'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ShRow({
  box,
  clients,
  open,
  onToggle,
  onConfirmed,
  onPhotoClick,
}: {
  box: PendingShBox;
  clients: ClientPickerOption[];
  open: boolean;
  onToggle: () => void;
  onConfirmed: () => void;
  onPhotoClick: (url: string) => void;
}) {
  const [edit, setEdit] = useState<ShEdit>({
    client_id: box.client_id,
    billing_mode: box.billing_mode ?? 'in_out_daily',
    unit_number: box.unit_number ?? '',
    size: box.size ?? '',
    damage: box.damage ?? '',
    in_fee: box.in_fee ?? '',
    out_fee: box.out_fee ?? '',
    daily_rate: box.daily_rate ?? '',
    flat_rate: box.flat_rate ?? '',
    intake_date: isoToLocalInput(box.intake_date),
    notes: box.notes ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameConflict, setRenameConflict] = useState<UnitRenameConflict | null>(null);

  const canSave = (() => {
    if (edit.client_id == null) return false;
    if (edit.billing_mode === 'in_out_daily') {
      return Boolean(edit.in_fee && edit.out_fee && edit.daily_rate);
    }
    if (edit.billing_mode === 'flat_monthly') {
      return Boolean(edit.flat_rate);
    }
    return true; // non_billable
  })();

  const submit = async (confirmUnitRename = false) => {
    setSubmitting(true);
    setError(null);
    try {
      const isInOut = edit.billing_mode === 'in_out_daily';
      const isFlat = edit.billing_mode === 'flat_monthly';
      const res = await fetch(`/api/v2/sh-inventory/audit/${box.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          client_id: edit.client_id,
          billing_mode: edit.billing_mode,
          unit_number: edit.unit_number.trim() || undefined,
          size: edit.size.trim() || undefined,
          damage: edit.damage.trim() || null,
          in_fee: isInOut ? edit.in_fee : undefined,
          out_fee: isInOut ? edit.out_fee : undefined,
          daily_rate: isInOut ? edit.daily_rate : undefined,
          flat_rate: isFlat ? edit.flat_rate : undefined,
          intake_date: localInputToIso(edit.intake_date),
          notes: edit.notes || null,
          confirm_unit_rename: confirmUnitRename || undefined,
        }),
      });
      if (res.status === 409) {
        const body = (await res.json()) as {
          code?: string;
          details?: UnitRenameConflict;
        };
        if (body.code === 'unit_rename_confirm_required' && body.details) {
          setRenameConflict(body.details);
          return;
        }
      }
      if (!res.ok) throw new Error(`Something went wrong`);
      setRenameConflict(null);
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const summaryRate = (() => {
    if (box.billing_mode === 'flat_monthly') {
      return box.flat_rate ? `$${box.flat_rate}/mo flat` : 'Flat monthly (rate TBD)';
    }
    if (box.billing_mode === 'non_billable') return 'Non-billable';
    if (box.in_fee && box.out_fee && box.daily_rate) {
      return `$${box.in_fee} in · $${box.out_fee} out · $${box.daily_rate}/day`;
    }
    return 'Rates TBD';
  })();

  const summaryClient = (() => {
    if (box.client_id == null) return 'Unassigned';
    if (box.business_name && box.client_name)
      return `${box.client_name} — ${box.business_name}`;
    return box.client_name ?? `Client #${box.client_id}`;
  })();

  return (
    <div className={styles.row} data-open={open}>
      <button type="button" className={styles.rowHead} onClick={onToggle}>
        <div className={styles.rowSummary}>
          <span className={styles.rowTitle}>{box.unit_number || '(no unit number)'}</span>
          <span className={styles.rowMeta}>
            <span>{summaryClient}</span>
            <span>{box.size}</span>
            <span>{summaryRate}</span>
            {box.release_number_value && (
              <span>
                Release {box.release_number_value}
                {box.sale_company_name ? ` · ${box.sale_company_name}` : ''}
              </span>
            )}
            <span>Arrived {new Date(box.intake_date).toLocaleDateString()}</span>
          </span>
        </div>
        <span className={styles.rowChev}>{open ? 'Close' : 'Review ›'}</span>
      </button>
      {open && (
        <div className={styles.rowBody}>
          <PhotoStrip urls={box.photo_urls} onPhotoClick={onPhotoClick} />
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Customer *</span>
            <select
              value={edit.client_id ?? ''}
              onChange={(e) =>
                setEdit((s) => ({
                  ...s,
                  client_id: e.target.value ? Number(e.target.value) : null,
                }))
              }
              required
            >
              <option value="" disabled>
                — Pick a customer —
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
            <span className={styles.fieldLabel}>Billing mode *</span>
            <select
              value={edit.billing_mode}
              onChange={(e) =>
                setEdit((s) => ({
                  ...s,
                  billing_mode: e.target.value as ShBillingMode,
                }))
              }
            >
              <option value="in_out_daily">In/Out + daily storage</option>
              <option value="flat_monthly">Flat monthly</option>
              <option value="non_billable">Non-billable</option>
            </select>
          </label>
          <div className={styles.formRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Unit number</span>
              <UnitNumberInput
                value={edit.unit_number}
                onChange={(v) => setEdit((s) => ({ ...s, unit_number: v }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Size</span>
              <input
                type="text"
                value={edit.size}
                onChange={(e) => setEdit((s) => ({ ...s, size: e.target.value }))}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Damage / condition</span>
            <input
              type="text"
              value={edit.damage}
              onChange={(e) => setEdit((s) => ({ ...s, damage: e.target.value }))}
            />
          </label>
          {edit.billing_mode === 'in_out_daily' && (
            <div className={styles.formRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>In fee *</span>
                <CurrencyInput
                  value={edit.in_fee}
                  onChange={(v) => setEdit((s) => ({ ...s, in_fee: v }))}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Out fee *</span>
                <CurrencyInput
                  value={edit.out_fee}
                  onChange={(v) => setEdit((s) => ({ ...s, out_fee: v }))}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Daily rate *</span>
                <CurrencyInput
                  value={edit.daily_rate}
                  onChange={(v) => setEdit((s) => ({ ...s, daily_rate: v }))}
                />
              </label>
            </div>
          )}
          {edit.billing_mode === 'flat_monthly' && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Flat monthly rate *</span>
              <CurrencyInput
                value={edit.flat_rate}
                onChange={(v) => setEdit((s) => ({ ...s, flat_rate: v }))}
                placeholder="0.00"
              />
            </label>
          )}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Intake date</span>
            <input
              type="datetime-local"
              value={edit.intake_date}
              onChange={(e) =>
                setEdit((s) => ({ ...s, intake_date: e.target.value }))
              }
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Notes</span>
            <textarea
              rows={2}
              value={edit.notes}
              onChange={(e) => setEdit((s) => ({ ...s, notes: e.target.value }))}
            />
          </label>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.actions}>
            <Button variant="ghost" onClick={onToggle} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => submit(false)}
              disabled={submitting || !canSave}
            >
              {submitting ? 'Saving…' : 'Save & approve'}
            </Button>
          </div>
        </div>
      )}
      <UnitRenameModal
        conflict={renameConflict}
        onCancel={() => setRenameConflict(null)}
        onConfirm={() => {
          setRenameConflict(null);
          submit(true);
        }}
        busy={submitting}
      />
    </div>
  );
}

// Thumbnail strip above the audit form. URLs are presigned by the server
// on the pending-list response. Clicking opens the photo in a lightbox
// instead of navigating away.
function PhotoStrip({
  urls,
  onPhotoClick,
}: {
  urls: string[] | null;
  onPhotoClick: (url: string) => void;
}) {
  if (!urls || urls.length === 0) return null;
  return (
    <div className={styles.photoStrip}>
      {urls.map((url, i) => (
        <button
          key={url}
          type="button"
          className={styles.photoThumbBtn}
          onClick={() => onPhotoClick(url)}
          aria-label={`Open photo ${i + 1}`}
        >
          <img
            src={url}
            alt={`Intake photo ${i + 1}`}
            className={styles.photoThumb}
            data-role={i === 0 ? 'primary' : 'extra'}
          />
        </button>
      ))}
    </div>
  );
}
