import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Button, Modal, PhotoLightbox } from '../ui';
import styles from './InventoryEditor.module.css';
import { SIZE_DATALIST_ID, useSizePresetLabels } from './sizePresets';
import { DAMAGE_DATALIST_ID, useDamagePresetLabels } from './damagePresets';

// Shape matches the row format produced by GET /api/v1/inventory (the
// route's JOIN-enriched response). photo_urls is fetched separately on
// editor open since the list endpoint omits presigned URLs to stay lean.
export interface InventoryEditorRow {
  id: number;
  date: string;
  unit_number: string;
  size: string;
  damage: string | null;
  trucking_company: string | null;
  release_number_id: number | null;
  sale_company_id: number | null;
  notes: string | null;
  acquisition_price: string | number | null;
  state: 'pending' | 'available' | 'hold' | 'sold' | 'outbound';
  is_pending_audit: boolean;
  photos: string[] | null;
  sale_company_name: string | null;
  release_number_value: string | null;
  outbound_date: string | null;
  invoice_number: number | null;
  invoice_id: number | null;
}

interface Props {
  row: InventoryEditorRow | null;
  onClose: () => void;
  onSaved: (updated: InventoryEditorRow) => void;
  onError: (msg: string) => void;
}

// unit_number is intentionally NOT here. It's set at intake and may be
// corrected during audit (admin reading the photo), but after a box
// transitions out of 'pending' state the number locks. Editing it later
// would orphan the matching release_number_containers row that intake
// auto-flipped to is_used=true based on the original number — keeping
// it read-only here keeps inventory + release enumeration in sync.
const EDITABLE_FIELDS = [
  'size',
  'damage',
  'trucking_company',
  'acquisition_price',
  'notes',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

const FIELD_LABELS: Record<EditableField, string> = {
  size: 'Size',
  damage: 'Damage',
  trucking_company: 'Trucking Co.',
  acquisition_price: 'Acq. Price',
  notes: 'Notes',
};

const normalize = (v: string | number | null | undefined): string =>
  v == null || v === '' ? '' : String(v).trim();

const fieldChanged = (
  draft: InventoryEditorRow,
  original: InventoryEditorRow,
  key: EditableField,
): boolean => normalize(draft[key]) !== normalize(original[key]);

const fmtMoney = (v: string | number | null | undefined): string => {
  const s = normalize(v);
  if (!s) return '';
  const n = Number(s);
  return Number.isFinite(n)
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : s;
};

const fmtDisplay = (key: EditableField, v: string | number | null | undefined): string => {
  if (key === 'acquisition_price') return fmtMoney(v);
  const s = normalize(v);
  return s;
};

export function InventoryEditor({ row, onClose, onSaved, onError }: Props) {
  const [draft, setDraft] = useState<InventoryEditorRow | null>(row);
  const [photoUrls, setPhotoUrls] = useState<string[] | null>(null);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const sizeLabels = useSizePresetLabels();
  const damageLabels = useDamagePresetLabels();
  // Passive read-only hint banner. Set when the user clicks a
  // non-editable field (sale_co, release#, intake date, state,
  // sold-row block); dismissed by the X. Doesn't steal focus or
  // block the form — just explains where to make that change.
  const [readOnlyHint, setReadOnlyHint] = useState<string | null>(null);

  useEffect(() => {
    setDraft(row);
    setConfirming(false);
    setPhotoUrls(null);
    setReadOnlyHint(null);
  }, [row]);

  // Fetch photo URLs on open. The list endpoint omits presigned URLs;
  // detail GET attaches them via attachPhotoUrls.
  useEffect(() => {
    if (!row?.id) return;
    if (!row.photos || row.photos.length === 0) {
      setPhotoUrls([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/inventory/${row.id}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          data: { inventory: { photo_urls: string[] | null }[] };
        };
        if (cancelled) return;
        setPhotoUrls(body.data.inventory[0]?.photo_urls ?? []);
      } catch {
        if (!cancelled) setPhotoUrls([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row?.id, row?.photos]);

  const changes = useMemo(() => {
    if (!draft || !row) return [] as EditableField[];
    return EDITABLE_FIELDS.filter((k) => fieldChanged(draft, row, k));
  }, [draft, row]);

  if (!row || !draft) return null;

  const set =
    (key: EditableField) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setDraft((prev) =>
        prev ? { ...prev, [key]: v === '' ? null : v } : prev,
      );
      setConfirming(false); // any further edit cancels the confirm step
    };

  const submit = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSaving(true);
    try {
      const putRes = await fetch(`/api/v1/inventory/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          unit_number: row.unit_number, // locked — pass through unchanged
          size: draft.size,
          damage: draft.damage,
          trucking_company: draft.trucking_company,
          state: draft.state, // unchanged; PUT route requires the column
          acquisition_price: draft.acquisition_price,
        }),
      });
      if (!putRes.ok) throw new Error(`update failed (${putRes.status})`);
      if (changes.includes('notes')) {
        const notesRes = await fetch(`/api/v1/inventory/notes/${row.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ notes: draft.notes ?? '' }),
        });
        if (!notesRes.ok)
          throw new Error(`notes update failed (${notesRes.status})`);
      }
      onSaved(draft);
    } catch (err) {
      onError(`ERROR ${err instanceof Error ? err.message : 'Update failed'}`);
      setSaving(false);
      setConfirming(false);
    }
  };

  const cancelConfirm = () => setConfirming(false);

  const isSold = row.state === 'sold' || row.state === 'outbound';
  const hasInvoice = row.invoice_number != null;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`Edit ${row.unit_number.trim()}`}
      size="lg"
      closeOnBackdropClick={!saving}
      closeOnEscape={!saving}
    >
      {readOnlyHint && (
        <div className={styles.hintBanner} role="status">
          <span className={styles.hintBannerIcon} aria-hidden="true">
            ⚠
          </span>
          <span className={styles.hintBannerText}>{readOnlyHint}</span>
          <button
            type="button"
            className={styles.hintBannerClose}
            onClick={() => setReadOnlyHint(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className={styles.layout}>
        {/* ── Left: edit form ─────────────────────────────────── */}
        <section className={styles.pane}>
          <div className={styles.paneHeader}>
            <span>Edit</span>
            {changes.length > 0 && (
              <span className={styles.changeChip}>
                {changes.length} change{changes.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {/* photos */}
          <PhotoStrip
            urls={photoUrls}
            loading={photoUrls === null}
            onPhotoClick={(u) => setPhotoSrc(u)}
          />

          {/* editable fields */}
          <div className={styles.form}>
            {EDITABLE_FIELDS.map((key) => {
              const changed = fieldChanged(draft, row, key);
              const wide = key === 'damage' || key === 'notes' || key === 'trucking_company';
              const listId =
                key === 'size'
                  ? SIZE_DATALIST_ID
                  : key === 'damage'
                  ? DAMAGE_DATALIST_ID
                  : undefined;
              return (
                <div
                  key={key}
                  className={`${styles.field} ${wide ? styles.fieldWide : ''}`}
                >
                  <label className={styles.label}>{FIELD_LABELS[key]}</label>
                  <input
                    className={`${styles.input} ${changed ? styles.changed : ''}`}
                    value={
                      draft[key] == null ? '' : String(draft[key])
                    }
                    onChange={set(key)}
                    type={key === 'acquisition_price' ? 'number' : 'text'}
                    step={key === 'acquisition_price' ? '0.01' : undefined}
                    maxLength={key === 'notes' ? 255 : key === 'damage' ? 120 : 60}
                    list={listId}
                  />
                </div>
              );
            })}
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

            {/* read-only display fields. Clicking surfaces a passive
                hint banner at the top explaining where to make the
                change instead. */}
            <ReadOnlyField
              label="Unit Number"
              value={row.unit_number.trim()}
              hint="Locked after audit"
              onAttemptEdit={() =>
                setReadOnlyHint(
                  'A container’s unit number is set at intake and can be corrected on the Audit page while the container is still pending. Once audit completes, the unit number is locked so it stays in sync with the release number it was matched to.',
                )
              }
            />
            <ReadOnlyField
              label="Sale Co."
              value={row.sale_company_name}
              hint="Set by the release number"
              onAttemptEdit={() =>
                setReadOnlyHint(
                  'The sale company comes from the container’s release number. To change it, reassign the release on the Releases page.',
                )
              }
            />
            <ReadOnlyField
              label="Release #"
              value={row.release_number_value}
              hint="Change on the Releases page"
              onAttemptEdit={() =>
                setReadOnlyHint(
                  'Release numbers are managed on the Releases page. Open Releases to reassign this container.',
                )
              }
            />
            <ReadOnlyField
              label="Intake date"
              value={row.date?.slice(0, 10) ?? null}
              onAttemptEdit={() =>
                setReadOnlyHint(
                  'The intake date is recorded when a container arrives. While a container is still pending review, an admin can adjust it from the Audit page.',
                )
              }
            />
            <ReadOnlyField
              label="State"
              value={row.state}
              onAttemptEdit={() =>
                setReadOnlyHint(
                  'A container’s state updates automatically as it moves through the yard. Creating an invoice for it marks it sold; once it ships out, it becomes outbound.',
                )
              }
            />

            {isSold && (
              <div
                role="button"
                tabIndex={0}
                className={`${styles.readonlyField} ${styles.readonlyClickable} ${styles.fieldWide}`}
                onClick={() =>
                  setReadOnlyHint(
                    hasInvoice
                      ? `Sale price, modification, destination, and outbound date live on invoice #${row.invoice_number}. Open the invoice detail page to change them.`
                      : 'Sold-row fields are managed alongside the invoice. Open the matching invoice to change them.',
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setReadOnlyHint(
                      hasInvoice
                        ? `Sale price, modification, destination, and outbound date live on invoice #${row.invoice_number}. Open the invoice detail page to change them.`
                        : 'Sold-row fields are managed alongside the invoice. Open the matching invoice to change them.',
                    );
                  }
                }}
              >
                <span className={styles.readonlyHint}>Sold-row fields</span>
                <span className={styles.readonlyValue}>
                  Outbound: {row.outbound_date?.slice(0, 10) ?? '—'} ·{' '}
                  Invoice: {row.invoice_number ?? '—'}
                </span>
                {hasInvoice && row.invoice_id != null && (
                  <a
                    href={`/invoices/${row.invoice_id}`}
                    className={styles.readonlyLink}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Edit on invoice page →
                  </a>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Right: live diff preview ──────────────────────── */}
        <section className={styles.pane}>
          <div className={styles.paneHeader}>
            <span>Preview</span>
            <span className={styles.changeChip}>
              {confirming ? 'Confirm to apply' : 'Live'}
            </span>
          </div>

          {changes.length === 0 ? (
            <div className={styles.noChanges}>
              No changes yet. Edit a field on the left to see the diff here.
            </div>
          ) : (
            EDITABLE_FIELDS.filter((k) => fieldChanged(draft, row, k)).map(
              (key) => {
                const oldVal = fmtDisplay(key, row[key]);
                const newVal = fmtDisplay(key, draft[key]);
                return (
                  <div
                    key={key}
                    className={`${styles.diffField} ${styles.changedField}`}
                  >
                    <span className={styles.diffLabel}>
                      {FIELD_LABELS[key]}
                    </span>
                    <span className={styles.diffValue}>
                      {oldVal ? (
                        <span className={styles.diffOld}>{oldVal}</span>
                      ) : (
                        <span className={styles.diffEmpty}>(empty)</span>
                      )}
                      <span className={styles.diffArrow}>→</span>
                      {newVal ? (
                        <span className={styles.diffNew}>{newVal}</span>
                      ) : (
                        <span className={styles.diffEmpty}>(cleared)</span>
                      )}
                    </span>
                  </div>
                );
              },
            )
          )}
        </section>
      </div>

      {/* ── action footer ─────────────────────────────────── */}
      <div className={styles.actions}>
        <div className={styles.actionsLeft}>
          {confirming && (
            <span className={styles.confirmBanner}>
              Review the diff and confirm to apply {changes.length} change
              {changes.length === 1 ? '' : 's'}.
            </span>
          )}
        </div>
        <div className={styles.actionsRight}>
          {confirming ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={cancelConfirm}
                disabled={saving}
              >
                Back
              </Button>
              <Button type="button" onClick={submit} disabled={saving}>
                {saving ? 'Saving…' : 'Confirm & save'}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submit}
                disabled={saving || changes.length === 0}
              >
                Review changes
              </Button>
            </>
          )}
        </div>
      </div>

      <PhotoLightbox src={photoSrc} onClose={() => setPhotoSrc(null)} />
    </Modal>
  );
}

interface ReadOnlyFieldProps {
  label: string;
  value: string | number | null | undefined;
  hint?: string;
  wide?: boolean;
  onAttemptEdit?: () => void;
}

function ReadOnlyField({
  label,
  value,
  hint,
  wide,
  onAttemptEdit,
}: ReadOnlyFieldProps) {
  const interactive = !!onAttemptEdit;
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={`${styles.readonlyField} ${
        interactive ? styles.readonlyClickable : ''
      } ${wide ? styles.fieldWide : ''}`}
      onClick={onAttemptEdit}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onAttemptEdit!();
              }
            }
          : undefined
      }
    >
      <span className={styles.readonlyHint}>{label}</span>
      <span className={styles.readonlyValue}>
        {value == null || value === '' ? '—' : value}
      </span>
      {hint && <span className={styles.readonlyHint}>{hint}</span>}
    </div>
  );
}

interface PhotoStripProps {
  urls: string[] | null;
  loading: boolean;
  onPhotoClick: (url: string) => void;
}

function PhotoStrip({ urls, loading, onPhotoClick }: PhotoStripProps) {
  if (loading) {
    return <div className={styles.photoEmpty}>Loading photos…</div>;
  }
  if (!urls || urls.length === 0) {
    return <div className={styles.photoEmpty}>No photos on file.</div>;
  }
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
            alt={`Container photo ${i + 1}`}
            className={styles.photoThumb}
          />
        </button>
      ))}
    </div>
  );
}
