import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import styles from './CurrencyInput.module.css';

interface CurrencyInputProps {
  // Stored value: a plain decimal string ("1500", "25.5") or number. The
  // component shows a leading "$" and formats on blur; onChange emits the
  // normalized numeric string ('' when cleared) — never the "$".
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

const toText = (v: string | number | null | undefined): string =>
  v == null || v === '' ? '' : String(v);

// Keep only digits and a single decimal point.
const sanitize = (raw: string): string => {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return (
    cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
  );
};

// 2-dp banker's rounding (HALF_EVEN), returned as a fixed-2 string.
const toHalfEven2 = (n: number): string => {
  const scaled = n * 100;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded: number;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1; // exactly .5 → to even
  return (rounded / 100).toFixed(2);
};

// Strip leading zeros ("025.50" → "25.50", "0.5" stays) + clamp to 2dp.
const normalizeOnBlur = (text: string): string => {
  const s = sanitize(text);
  if (s === '' || s === '.') return '';
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  return toHalfEven2(n);
};

export function CurrencyInput({
  value,
  onChange,
  className,
  placeholder,
  disabled,
  id,
}: CurrencyInputProps) {
  const [text, setText] = useState<string>(() => toText(value));
  const focused = useRef(false);

  // Sync from parent when the external value changes and we're not mid-edit.
  useEffect(() => {
    if (!focused.current) setText(toText(value));
  }, [value]);

  return (
    <div className={`${styles.wrap} ${className ?? ''}`}>
      <span className={styles.dollar} aria-hidden="true">
        $
      </span>
      <input
        id={id}
        className={styles.input}
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          const next = sanitize(e.target.value);
          setText(next);
          onChange(next);
        }}
        onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
          e.preventDefault();
          const next = sanitize(e.clipboardData.getData('text'));
          setText(next);
          onChange(next);
        }}
        onBlur={() => {
          focused.current = false;
          const normalized = normalizeOnBlur(text);
          setText(normalized);
          onChange(normalized);
        }}
      />
    </div>
  );
}
