import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';
import { userContext } from '../../context/userContext';
import styles from './ShYardSection.module.css';

interface InStorageBox {
  id: number;
  client_name?: string;
  business_name?: string | null;
  unit_number: string;
  size: string;
  intake_date: string;
}

// Counts arrival day inclusive — matches countStorageDays() in
// server/lib/sh.ts. We can't share the helper across the package
// boundary today (server is ESM-from-source), so duplicate the simple
// formula here. The S&H invoicing pipeline (PR 3) computes billing
// days server-side and is the source of truth for any money figure.
function daysOnsite(intakeIso: string): number {
  const intake = new Date(intakeIso);
  intake.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - intake.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

// Format a Date as the value expected by <input type="datetime-local">.
const isoToLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Yard view's S&H section (PR 2.7). Lists in_storage boxes with the
// days-onsite badge and an admin-only check-out shortcut. The badge
// flips a "long stay" colour over 30 days to surface boxes that might
// need attention; the threshold is cosmetic, not business-critical.
export function ShYardSection() {
  const { user } = useContext(userContext);
  const isAdmin = user.permissions === 'admin';
  const { t } = useTranslation();
  const [boxes, setBoxes] = useState<InStorageBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/sh-inventory?state=in_storage', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Something went wrong`);
      const body = (await res.json()) as { data: { boxes: InStorageBox[] } };
      setBoxes(body.data.boxes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t('sh_yard.title')}</h2>
        <span className={styles.count}>
          {loading
            ? t('common.loading')
            : t('sh_yard.count', { count: boxes.length })}
        </span>
      </div>

      {error && <div className={styles.checkoutError}>{error}</div>}

      {!loading && boxes.length === 0 ? (
        <div className={styles.empty}>{t('sh_yard.empty')}</div>
      ) : (
        <div className={styles.list}>
          {boxes.map((b) => (
            <ShYardRow
              key={b.id}
              box={b}
              isAdmin={isAdmin}
              onCheckedOut={load}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ShYardRow({
  box,
  isAdmin,
  onCheckedOut,
}: {
  box: InStorageBox;
  isAdmin: boolean;
  onCheckedOut: () => void;
}) {
  const { t } = useTranslation();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutDate, setCheckoutDate] = useState(() =>
    isoToLocalInput(new Date()),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = daysOnsite(box.intake_date);
  const clientLabel =
    box.business_name && box.client_name
      ? `${box.client_name} — ${box.business_name}`
      : box.client_name ?? `Client #?`;

  const confirmCheckout = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const iso = new Date(checkoutDate).toISOString();
      const res = await fetch(`/api/v2/sh-inventory/checkout/${box.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ checkout_date: iso }),
      });
      if (!res.ok) throw new Error(`Something went wrong`);
      setCheckoutOpen(false);
      onCheckedOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check-out failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.row}>
      <div className={styles.who}>
        <span className={styles.unit}>{box.unit_number}</span>
        <span className={styles.meta}>
          <span>{clientLabel}</span>
          <span>{box.size}</span>
        </span>
      </div>
      <span className={styles.daysBadge} data-long={days > 30}>
        {t(days === 1 ? 'sh_yard.days_on_yard_one' : 'sh_yard.days_on_yard_other', { days })}
      </span>
      {isAdmin && (
        <div>
          {!checkoutOpen ? (
            <Button variant="ghost" onClick={() => setCheckoutOpen(true)}>
              {t('sh_yard.check_out')}
            </Button>
          ) : (
            <div className={styles.checkoutInline}>
              <input
                type="datetime-local"
                className={styles.dateInput}
                value={checkoutDate}
                onChange={(e) => setCheckoutDate(e.target.value)}
              />
              <Button
                variant="primary"
                onClick={confirmCheckout}
                disabled={submitting}
              >
                {submitting ? '…' : t('common.confirm')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setCheckoutOpen(false)}
                disabled={submitting}
              >
                {t('common.cancel')}
              </Button>
              {error && <div className={styles.checkoutError}>{error}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
