import { CurrencyInput, IconButton } from '../ui';
import { useModPresets } from './modificationPresets';
import styles from './ModificationRows.module.css';

// Shared modification-row editor used by every quote/invoice editor
// (CreateQuote, CreateInvoice, QuoteEditor, InvoiceEditor) so the four
// stay in lockstep. Replaces the old per-file <datalist> markup, which
// was awkward on iPad. Here the description is a real <select> of presets
// with an explicit "Custom (write-in)" default that reveals a free-text
// field — no hidden typing required.
//
// Generic over the caller's mod shape: we only ever touch
// description/price/quantity and pass the rest through, so callers keep
// their own extra fields (position, quote_line_item_id, …).

const CUSTOM = '__custom__';

export interface ModLike {
  id: number;
  description: string;
  price: string;
  quantity: number;
}

export function ModificationRows<T extends ModLike>({
  mods,
  onChange,
  makeBlank,
}: {
  mods: T[];
  onChange: (next: T[]) => void;
  /** Factory for a new blank row in the caller's own shape (id scheme,
   *  position, etc.). Should set quantity = 1. */
  makeBlank: () => T;
}) {
  const presets = useModPresets();

  const patch = (idx: number, p: Partial<ModLike>) =>
    onChange(mods.map((m, i) => (i === idx ? { ...m, ...p } : m)));

  const onSelect = (idx: number, value: string) => {
    if (value === CUSTOM) {
      // Switch to write-in: clear the description so the text field is
      // ready to type into. Price/quantity left as-is.
      patch(idx, { description: '' });
      return;
    }
    const preset = presets.find((p) => p.label === value);
    // Always (re)bind the preset's price — switching presets must update
    // the price, which the old "only when empty" autofill failed to do.
    patch(idx, {
      description: value,
      price: preset?.default_price != null ? String(preset.default_price) : '0',
    });
  };

  return (
    <div className={styles.rows}>
      {mods.map((m, idx) => {
        const isPreset = presets.some((p) => p.label === m.description);
        const selectValue = isPreset ? m.description : CUSTOM;
        return (
          <div key={m.id} className={styles.row}>
            <div className={styles.descCell}>
              <select
                className={styles.select}
                value={selectValue}
                onChange={(e) => onSelect(idx, e.target.value)}
              >
                <option value={CUSTOM}>Custom (write-in)</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
              {selectValue === CUSTOM && (
                <input
                  className={styles.desc}
                  placeholder="Description"
                  value={m.description}
                  onChange={(e) => patch(idx, { description: e.target.value })}
                />
              )}
            </div>
            <input
              className={styles.qty}
              type="number"
              min={1}
              step={1}
              aria-label="Quantity"
              value={m.quantity ?? 1}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                patch(idx, { quantity: Number.isFinite(n) && n >= 1 ? n : 1 });
              }}
            />
            <CurrencyInput
              value={m.price}
              onChange={(v) => patch(idx, { price: v })}
              placeholder="0.00"
            />
            <IconButton
              icon="trash"
              tone="danger"
              label="Remove modification"
              onClick={() => onChange(mods.filter((_, i) => i !== idx))}
            />
          </div>
        );
      })}
      <button
        type="button"
        className={styles.addRow}
        onClick={() => onChange([...mods, makeBlank()])}
      >
        + Add modification
      </button>
    </div>
  );
}
