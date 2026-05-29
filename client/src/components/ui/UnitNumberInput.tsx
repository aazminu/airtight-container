import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

// ISO 6346 container unit numbers are `LLLL ######-#`: four-letter owner
// prefix, six-digit serial, one-digit check digit. This input formats
// as the operator types — uppercases letters, inserts the space after
// the prefix, and the dash before the check digit. Soft: anything that
// doesn't fit (legacy yard tags, single-digit Times-Square labels, OCR
// outliers) is still accepted; we just stop applying the mask past the
// expected length so the operator can override.
//
// Extra digits past the check are passed through unchanged (no extra
// mask separators) up to the column's 40-char cap. Keeps non-standard
// yard tags editable without the input fighting them.
//
// The value passed in/out keeps the formatting characters (space + dash)
// so downstream code can render it directly. Storage normalisation, if
// the operator ever wants pure digits, lives in lib/unitNumber.

// Matches `unit_number` Zod max in server/validation/{intake,sh_inventory}.
const COLUMN_MAX = 40;

const formatUnit = (raw: string): string => {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, COLUMN_MAX);

  if (cleaned.length <= 4) return cleaned;
  if (cleaned.length <= 10) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4)}`;
  }
  return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 10)}-${cleaned.slice(10)}`;
};

interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (next: string) => void;
}

export const UnitNumberInput = forwardRef<HTMLInputElement, Props>(
  function UnitNumberInput({ value, onChange, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        placeholder="LLLL ######-#"
        {...rest}
        value={value}
        onChange={(e) => onChange(formatUnit(e.target.value))}
      />
    );
  },
);
