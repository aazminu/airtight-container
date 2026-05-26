import { useEffect, useState } from 'react';
import { Modal, Button } from '../ui';
import {
  SMS_CONSENT_SECTIONS,
  SMS_CONSENT_VERSION,
} from '../../lib/smsConsent';
import styles from './SendSmsDialog.module.css';

// Send-to-Driver dialog. Renders the SMS-consent disclosure inline so
// the operator can read it to the driver at handoff, then gates the
// Send button on a required attestation checkbox. Submits both the
// phone number and `consent: { attested, text_version }`; the server
// refuses to dispatch if either is missing or stale (see
// server/lib/sms-consent.ts).

const validatePhone = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return 'A phone number is required.';
  if (trimmed.startsWith('+')) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return null;
  if (digits.length === 11 && digits.startsWith('1')) return null;
  return 'Enter a valid US phone number.';
};

export interface SendSmsResult {
  to: string;
  consent: { attested: true; text_version: string };
}

export interface SendSmsDialogProps {
  open: boolean;
  defaultPhone?: string;
  driverName?: string | null;
  onCancel: () => void;
  onConfirm: (result: SendSmsResult) => void;
}

export function SendSmsDialog({
  open,
  defaultPhone = '',
  driverName,
  onCancel,
  onConfirm,
}: SendSmsDialogProps) {
  const [phone, setPhone] = useState(defaultPhone);
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the dialog reopens so a prior cancel
  // doesn't carry stale attestation forward.
  useEffect(() => {
    if (open) {
      setPhone(defaultPhone);
      setAttested(false);
      setError(null);
    }
  }, [open, defaultPhone]);

  const phoneError = validatePhone(phone);
  const canSend = !phoneError && attested;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneError) {
      setError(phoneError);
      return;
    }
    if (!attested) {
      setError(
        'Confirm the driver consented to receive the SMS before sending.',
      );
      return;
    }
    onConfirm({
      to: phone.trim(),
      consent: { attested: true, text_version: SMS_CONSENT_VERSION },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Send delivery receipt by SMS"
      ariaLabel="Send SMS dialog"
      size="lg"
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <p className={styles.lede}>
          Read the disclosure below to the driver
          {driverName ? ` (${driverName})` : ''}, confirm they agree, and
          tick the box before sending. We log the attestation against
          your user for audit.
        </p>

        <section className={styles.terms} aria-label="SMS consent terms">
          {SMS_CONSENT_SECTIONS.map((section) => (
            <div key={section.heading} className={styles.termsItem}>
              <h3 className={styles.termsHeading}>{section.heading}</h3>
              <p className={styles.termsBody}>{section.body}</p>
            </div>
          ))}
        </section>

        <p className={styles.termsFootnote}>
          Full SMS policy:{' '}
          <a href="/sms-terms" target="_blank" rel="noreferrer">
            airtightshippingcontainer.com/sms-terms
          </a>
        </p>

        <label className={styles.field} htmlFor="sms-phone">
          <span className={styles.fieldLabel}>Driver phone</span>
          <input
            id="sms-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            className={styles.input}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (error) setError(null);
            }}
            placeholder="(732) 555-0142"
            autoFocus
          />
        </label>

        <label className={styles.attest}>
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => {
              setAttested(e.target.checked);
              if (error) setError(null);
            }}
          />
          <span>
            I confirm the driver was shown (or read) the disclosure above
            and gave verbal consent to receive a one-time delivery-receipt
            SMS at the number entered.
          </span>
        </label>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!canSend}>
            Send SMS
          </Button>
        </div>
      </form>
    </Modal>
  );
}
