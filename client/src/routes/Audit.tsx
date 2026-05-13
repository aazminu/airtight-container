import { useEffect, useState } from 'react';
import { Badge, Button, PhotoLightbox } from '../components/ui';
import styles from './Audit.module.css';

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

interface PendingShBox {
  id: number;
  client_id: number;
  client_name?: string;
  business_name?: string | null;
  unit_number: string;
  size: string;
  damage: string | null;
  in_fee: string;
  out_fee: string;
  daily_rate: string;
  intake_date: string;
  notes: string | null;
  photo_urls: string[] | null;
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
  unit_number: string;
  size: string;
  damage: string;
  in_fee: string;
  out_fee: string;
  daily_rate: string;
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [salesRes, shRes] = await Promise.all([
        fetch('/api/v1/inventory?pending_audit=true', { credentials: 'include' }),
        fetch('/api/v2/sh-inventory?state=pending', { credentials: 'include' }),
      ]);
      if (!salesRes.ok) throw new Error(`Sales HTTP ${salesRes.status}`);
      if (!shRes.ok) throw new Error(`Storage HTTP ${shRes.status}`);
      const salesBody = (await salesRes.json()) as {
        data: { inventory: PendingSalesBox[] };
      };
      const shBody = (await shRes.json()) as { data: { boxes: PendingShBox[] } };
      setSales(salesBody.data.inventory);
      setSh(shBody.data.boxes);
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
  openKey,
  setOpenKey,
  onConfirmed,
  onPhotoClick,
}: {
  boxes: PendingShBox[];
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
        <Badge tone="info">Confirm rates + intake date</Badge>
      </div>
      {boxes.length === 0 ? (
        <div className={styles.empty}>No Storage boxes pending.</div>
      ) : (
        <div className={styles.list}>
          {boxes.map((b) => (
            <ShRow
              key={b.id}
              box={b}
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

  const submit = async () => {
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
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
              <input
                type="text"
                value={edit.unit_number}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, unit_number: e.target.value.toUpperCase() }))
                }
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
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
              <span className={styles.fieldLabel}>Acquisition price ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={edit.acquisition_price}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, acquisition_price: e.target.value }))
                }
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
            <Button variant="primary" onClick={submit} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save & approve'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ShRow({
  box,
  open,
  onToggle,
  onConfirmed,
  onPhotoClick,
}: {
  box: PendingShBox;
  open: boolean;
  onToggle: () => void;
  onConfirmed: () => void;
  onPhotoClick: (url: string) => void;
}) {
  const [edit, setEdit] = useState<ShEdit>({
    unit_number: box.unit_number ?? '',
    size: box.size ?? '',
    damage: box.damage ?? '',
    in_fee: box.in_fee,
    out_fee: box.out_fee,
    daily_rate: box.daily_rate,
    intake_date: isoToLocalInput(box.intake_date),
    notes: box.notes ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/sh-inventory/audit/${box.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          unit_number: edit.unit_number.trim() || undefined,
          size: edit.size.trim() || undefined,
          damage: edit.damage.trim() || null,
          in_fee: edit.in_fee,
          out_fee: edit.out_fee,
          daily_rate: edit.daily_rate,
          intake_date: localInputToIso(edit.intake_date),
          notes: edit.notes || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const clientLabel =
    box.business_name && box.client_name
      ? `${box.client_name} — ${box.business_name}`
      : box.client_name ?? `Client #${box.client_id}`;

  return (
    <div className={styles.row} data-open={open}>
      <button type="button" className={styles.rowHead} onClick={onToggle}>
        <div className={styles.rowSummary}>
          <span className={styles.rowTitle}>{box.unit_number || '(no unit number)'}</span>
          <span className={styles.rowMeta}>
            <span>{clientLabel}</span>
            <span>{box.size}</span>
            <span>
              ${box.in_fee} in · ${box.out_fee} out · ${box.daily_rate}/day
            </span>
            <span>Arrived {new Date(box.intake_date).toLocaleDateString()}</span>
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
              <input
                type="text"
                value={edit.unit_number}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, unit_number: e.target.value.toUpperCase() }))
                }
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
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
              <span className={styles.fieldLabel}>In fee ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={edit.in_fee}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, in_fee: e.target.value }))
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Out fee ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={edit.out_fee}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, out_fee: e.target.value }))
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Daily rate ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={edit.daily_rate}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, daily_rate: e.target.value }))
                }
              />
            </label>
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
            <Button variant="primary" onClick={submit} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save & approve'}
            </Button>
          </div>
        </div>
      )}
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
