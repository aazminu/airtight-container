import { useEffect, useState } from 'react';

const PRESETS = ['Doors to Cab', 'Doors to Rear'] as const;

interface Props {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}

// Two fixed options ("Doors to Cab" / "Doors to Rear") plus a "Custom…"
// path that reveals a free-text input. The parent only sees the final
// string value; the custom-mode toggle is local.
export function DoorOrientationField({ value, onChange, className }: Props) {
  const isPreset = (PRESETS as readonly string[]).includes(value);
  const [customMode, setCustomMode] = useState(value !== '' && !isPreset);

  useEffect(() => {
    if (value !== '' && !isPreset) setCustomMode(true);
  }, [value, isPreset]);

  const selectValue = customMode ? '__custom__' : value;

  return (
    <>
      <select
        className={className}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__custom__') {
            setCustomMode(true);
            onChange('');
          } else {
            setCustomMode(false);
            onChange(v);
          }
        }}
      >
        <option value="">— none —</option>
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value="__custom__">Custom…</option>
      </select>
      {customMode && (
        <input
          type="text"
          className={className}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Describe orientation"
          style={{ marginTop: '0.25rem' }}
        />
      )}
    </>
  );
}
