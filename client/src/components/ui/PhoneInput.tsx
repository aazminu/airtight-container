import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

// US phone number soft-mask. Formats as `XXX-XXX-XXXX` while the
// operator types; anything beyond ten digits is treated as an extension
// (`XXX-XXX-XXXX EXT. <rest>`). Server-side `normalizePhone` runs on
// every write, so this mask is purely UX — it doesn't have to be
// bulletproof for inputs to land canonically in the DB.

const formatPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)} EXT. ${digits.slice(10)}`;
};

interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onChange: (next: string) => void;
}

export const PhoneInput = forwardRef<HTMLInputElement, Props>(
  function PhoneInput({ value, onChange, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="XXX-XXX-XXXX"
        {...rest}
        value={value}
        onChange={(e) => onChange(formatPhone(e.target.value))}
      />
    );
  },
);
