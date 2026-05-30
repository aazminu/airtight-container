import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { UnitNumberInput } from './UnitNumberInput';
import { Button } from './Button';
import styles from './UnitNumberListInput.module.css';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  inputId?: string;
  placeholder?: string;
  addLabel?: string;
}

// Chip-list input for binding container numbers to a release. Each entry
// is added one at a time through a masked ISO 6346 input — enforces the
// `LLLL ######-#` shape the rest of the app stores. Enter or the Add
// button commits the draft; backspace on an empty draft pops the last
// chip. Dedup is silent (re-typing an existing number just clears the
// draft).
export function UnitNumberListInput({
  value,
  onChange,
  disabled,
  inputId,
  placeholder,
  addLabel = 'Add',
}: Props) {
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const commit = () => {
    const next = draft.trim().toUpperCase();
    if (!next) return;
    if (!value.includes(next)) {
      onChange([...value, next]);
    }
    setDraft('');
    ref.current?.focus();
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  const removeAt = (n: string) => {
    onChange(value.filter((x) => x !== n));
  };

  return (
    <div className={styles.wrap}>
      {value.length > 0 && (
        <div className={styles.chips}>
          {value.map((n) => (
            <span key={n} className={styles.chip}>
              <span>{n}</span>
              <button
                type="button"
                className={styles.remove}
                onClick={() => removeAt(n)}
                disabled={disabled}
                aria-label={`Remove ${n}`}
                title={`Remove ${n}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className={styles.row}>
        <UnitNumberInput
          ref={ref}
          id={inputId}
          className={styles.input}
          value={draft}
          onChange={setDraft}
          onKeyDown={handleKey}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={styles.addBtn}
          onClick={commit}
          disabled={disabled || !draft.trim()}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
