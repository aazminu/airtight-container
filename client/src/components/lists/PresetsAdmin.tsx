import { useContext, useEffect, useState } from 'react';
import { userContext } from '../../context/userContext';
import { useConfirm } from '../ui';

// Shared label/position CRUD table used by ModPresetsAdmin,
// SizePresetsAdmin, DamagePresetsAdmin. Each preset type has the same
// `{ id, label, position, created_at }` shape — the only differences are
// the API path, the title/subtitle copy, the remove-confirmation message,
// and the publish function that broadcasts updates to module-cached hook
// subscribers. ModPresets additionally carries an optional `default_price`
// for autofill into the invoice editor's modification rows; the price
// column is gated on the `showPrice` prop so size + damage admins stay
// label-only.

export interface PresetRecord {
  id: number;
  label: string;
  position: number;
  default_price?: string | null;
  created_at: string;
}

interface Props<T extends PresetRecord> {
  apiPath: string;
  title: string;
  subtitle: string;
  addPlaceholder: string;
  removeMessage: (label: string) => string;
  publishFn: (presets: T[]) => void;
  showPrice?: boolean;
}

// numeric pg → string at the JSON boundary. Trim/empty → null.
function parsePrice(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function fmtPrice(p: string | number | null | undefined): string {
  if (p == null || p === '') return '';
  const n = Number(p);
  return Number.isFinite(n) ? String(n) : String(p);
}

export default function PresetsAdmin<T extends PresetRecord>({
  apiPath,
  title,
  subtitle,
  addPlaceholder,
  removeMessage,
  publishFn,
  showPrice = false,
}: Props<T>) {
  const { setPopup } = useContext(userContext);
  const confirm = useConfirm();
  const [presets, setPresets] = useState<T[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [loading, setLoading] = useState(true);

  const columnCount = showPrice ? 4 : 3;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(apiPath, { credentials: 'include' });
        if (!res.ok) throw new Error(`Something went wrong`);
        const body = (await res.json()) as { data: { presets: T[] } };
        if (active) {
          setPresets(body.data.presets);
          publishFn(body.data.presets);
        }
      } catch {
        if (active) setPopup('ERROR Unable to load presets');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [apiPath, setPopup, publishFn]);

  const sync = (next: T[]) => {
    setPresets(next);
    publishFn(next);
  };

  const addPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    const position = presets.length;
    const body: Record<string, unknown> = { label, position };
    if (showPrice) body.default_price = parsePrice(newPrice);
    try {
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        setPopup('ERROR A preset with that label already exists.');
        return;
      }
      if (!res.ok) throw new Error(`Something went wrong`);
      const payload = (await res.json()) as { data: { preset: T } };
      sync([...presets, payload.data.preset]);
      setNewLabel('');
      setNewPrice('');
    } catch {
      setPopup('ERROR Unable to add preset');
    }
  };

  const renameAt = async (preset: T, nextLabel: string) => {
    const trimmed = nextLabel.trim();
    if (!trimmed || trimmed === preset.label) return;
    try {
      const res = await fetch(`${apiPath}/${preset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label: trimmed }),
      });
      if (res.status === 409) {
        setPopup('ERROR A preset with that label already exists.');
        return;
      }
      if (!res.ok) throw new Error(`Something went wrong`);
      sync(presets.map((p) => (p.id === preset.id ? { ...p, label: trimmed } : p)));
    } catch {
      setPopup('ERROR Unable to rename preset');
    }
  };

  const repriceAt = async (preset: T, raw: string) => {
    const next = parsePrice(raw);
    const current = preset.default_price == null ? null : Number(preset.default_price);
    if (next === current) return;
    try {
      const res = await fetch(`${apiPath}/${preset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ default_price: next }),
      });
      if (!res.ok) throw new Error(`Something went wrong`);
      const body = (await res.json()) as { data: { preset: T } };
      sync(presets.map((p) => (p.id === preset.id ? body.data.preset : p)));
    } catch {
      setPopup('ERROR Unable to update default price');
    }
  };

  const move = async (preset: T, direction: -1 | 1) => {
    const idx = presets.findIndex((p) => p.id === preset.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= presets.length) return;
    const other = presets[swapIdx];
    const optimistic = presets.slice();
    optimistic[idx] = { ...preset, position: other.position };
    optimistic[swapIdx] = { ...other, position: preset.position };
    optimistic.sort((a, b) => a.position - b.position || a.id - b.id);
    sync(optimistic);
    try {
      await Promise.all([
        fetch(`${apiPath}/${preset.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ position: other.position }),
        }),
        fetch(`${apiPath}/${other.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ position: preset.position }),
        }),
      ]);
    } catch {
      setPopup('ERROR Unable to reorder presets');
    }
  };

  const removeAt = async (preset: T) => {
    const ok = await confirm({
      title: 'Remove preset?',
      message: removeMessage(preset.label),
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`${apiPath}/${preset.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Something went wrong`);
      sync(presets.filter((p) => p.id !== preset.id));
    } catch {
      setPopup('ERROR Unable to delete preset');
    }
  };

  return (
    <div className="accountSettingsWrapper">
      <h3 className="relSubtitle">{title}</h3>
      <p className="tabSubtle">{subtitle}</p>
      <div className="accountTable">
        <table className="inventoryTable">
          <thead>
            <tr>
              <th>Label</th>
              {showPrice && <th>Default Price</th>}
              <th>Order</th>
              <th>Remove</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columnCount} className="emptyRow">
                  Loading…
                </td>
              </tr>
            ) : presets.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="emptyRow">
                  No presets yet.
                </td>
              </tr>
            ) : (
              presets.map((p, i) => (
                <tr className="userRow" key={p.id}>
                  <td>
                    <input
                      type="text"
                      defaultValue={p.label}
                      onBlur={(e) => renameAt(p, e.target.value)}
                    />
                  </td>
                  {showPrice && (
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="—"
                        defaultValue={fmtPrice(p.default_price)}
                        onBlur={(e) => repriceAt(p, e.target.value)}
                      />
                    </td>
                  )}
                  <td className="center reorderCell">
                    <button
                      type="button"
                      className="tableBtn"
                      disabled={i === 0}
                      onClick={() => move(p, -1)}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="tableBtn"
                      disabled={i === presets.length - 1}
                      onClick={() => move(p, 1)}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </td>
                  <td className="center">
                    <button
                      type="button"
                      className="tableBtn deleteBtn"
                      onClick={() => removeAt(p)}
                      aria-label="Remove preset"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        width="16"
                        height="16"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <form onSubmit={addPreset} className="addForm">
        <input
          type="text"
          placeholder={addPlaceholder}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        {showPrice && (
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Default price (optional)"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
          />
        )}
        <button type="submit" className="addBtn" disabled={!newLabel.trim()}>
          Add preset
        </button>
      </form>
    </div>
  );
}
