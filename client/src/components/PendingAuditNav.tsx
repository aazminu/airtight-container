import { useEffect, useRef, useState } from 'react';
import styles from './PendingAuditNav.module.css';

interface Counts {
  sales: number;
  sh: number;
}

// Navbar dropdown that replaces the simple /audit link. Shows total
// pending-audit count as a badge; clicking opens a list of per-domain
// counts that link to /audit. Counts re-fetch when the dropdown opens
// so admins see fresh numbers without a full page reload.
export function PendingAuditNav() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch('/api/v2/intake/pending-counts', {
        credentials: 'include',
      });
      if (!res.ok) return;
      const body = (await res.json()) as { data: Counts };
      setCounts(body.data);
    } catch {
      // Stale counts are fine; we don't want to noise the navbar with errors.
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const total = counts ? counts.sales + counts.sh : 0;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>Audit</span>
        <span className={styles.count} data-empty={total === 0}>
          {total}
        </span>
        <span className={styles.chev} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {counts === null ? (
            <div className={styles.menuEmpty}>Loading…</div>
          ) : total === 0 ? (
            <div className={styles.menuEmpty}>Nothing pending.</div>
          ) : (
            <>
              <a className={styles.menuItem} href="/audit" role="menuitem">
                <span className={styles.menuLabel}>Sales pending audit</span>
                <span className={styles.menuCount}>{counts.sales}</span>
              </a>
              <a className={styles.menuItem} href="/audit" role="menuitem">
                <span className={styles.menuLabel}>Storage pending audit</span>
                <span className={styles.menuCount}>{counts.sh}</span>
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
