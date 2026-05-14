import { useContext, useEffect, useState } from 'react';
import { userContext } from '../../context/restaurantcontext';
import { useConfirm } from '../ui';
import {
  publishModPresets,
  type ModPreset,
} from '../forms/modificationPresets';

export default function ModPresetsAdmin() {
  const { setPopup } = useContext(userContext);
  const confirm = useConfirm();
  const [presets, setPresets] = useState<ModPreset[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/v2/mod-presets', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { data: { presets: ModPreset[] } };
        if (active) {
          setPresets(body.data.presets);
          publishModPresets(body.data.presets);
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
  }, [setPopup]);

  const sync = (next: ModPreset[]) => {
    setPresets(next);
    publishModPresets(next);
  };

  const addPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    const position = presets.length;
    try {
      const res = await fetch('/api/v2/mod-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label, position }),
      });
      if (res.status === 409) {
        setPopup('ERROR A preset with that label already exists.');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data: { preset: ModPreset } };
      sync([...presets, body.data.preset]);
      setNewLabel('');
    } catch {
      setPopup('ERROR Unable to add preset');
    }
  };

  const renameAt = async (preset: ModPreset, nextLabel: string) => {
    const trimmed = nextLabel.trim();
    if (!trimmed || trimmed === preset.label) return;
    try {
      const res = await fetch(`/api/v2/mod-presets/${preset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label: trimmed }),
      });
      if (res.status === 409) {
        setPopup('ERROR A preset with that label already exists.');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sync(presets.map((p) => (p.id === preset.id ? { ...p, label: trimmed } : p)));
    } catch {
      setPopup('ERROR Unable to rename preset');
    }
  };

  const move = async (preset: ModPreset, direction: -1 | 1) => {
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
        fetch(`/api/v2/mod-presets/${preset.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ position: other.position }),
        }),
        fetch(`/api/v2/mod-presets/${other.id}`, {
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

  const removeAt = async (preset: ModPreset) => {
    const ok = await confirm({
      title: 'Remove preset?',
      message: `"${preset.label}" will no longer appear in the modification description suggestions. Existing invoices keep their text.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v2/mod-presets/${preset.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sync(presets.filter((p) => p.id !== preset.id));
    } catch {
      setPopup('ERROR Unable to delete preset');
    }
  };

  return (
    <div className="accountSettingsWrapper">
      <h3 className="relSubtitle">Modification Presets</h3>
      <p className="tabSubtle">
        Suggested descriptions for the modifications field on invoice line items.
        Free text is always allowed; these just appear as typeahead.
      </p>
      <div className="accountTable">
        <table className="inventoryTable">
          <thead>
            <tr>
              <th>Label</th>
              <th>Order</th>
              <th>Remove</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="emptyRow">
                  Loading…
                </td>
              </tr>
            ) : presets.length === 0 ? (
              <tr>
                <td colSpan={3} className="emptyRow">
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
          placeholder="New preset label"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <button type="submit" className="addBtn" disabled={!newLabel.trim()}>
          Add preset
        </button>
      </form>
    </div>
  );
}
