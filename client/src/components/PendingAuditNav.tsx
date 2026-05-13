import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './PendingAuditNav.module.css';

interface Counts {
  sales: number;
  sh: number;
}

// Navbar dropdown for pending audits (PR 2.8.1 rev).
// Behaviour:
//   - The "Audit" link itself navigates to /audit on click.
//   - Hovering the link opens a dropdown showing per-domain counts.
//   - Each dropdown row links to /audit (Phase 3 may split paths).
//   - Esc + click-outside also close, for keyboard / touch users.
//   - Counts refresh on open so admins see fresh numbers without a reload.
export function PendingAuditNav() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const closeHandle = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/intake/pending-counts', {
        credentials: 'include',
      });
      if (!res.ok) return;
      const body = (await res.json()) as { data: Counts };
      setCounts(body.data);
    } catch {
      // Stale counts are fine; don't noise the navbar.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
  }, [open, refresh]);

  // Small close-delay on mouseleave so the cursor can travel from the
  // trigger into the menu without it disappearing mid-jump.
  const handleEnter = () => {
    if (closeHandle.current !== null) {
      window.clearTimeout(closeHandle.current);
      closeHandle.current = null;
    }
    setOpen(true);
  };
  const handleLeave = () => {
    closeHandle.current = window.setTimeout(() => setOpen(false), 120);
  };

  const total = counts ? counts.sales + counts.sh : 0;

  return (
    <div
      className={styles.wrap}
      ref={wrapRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <a
        className={styles.trigger}
        href="/audit"
        aria-haspopup="menu"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          // Don't close when focus moves to a child menu link.
          if (!wrapRef.current?.contains(e.relatedTarget as Node)) {
            setOpen(false);
          }
        }}
      >
        <span className={styles.label}>Audit</span>
        {total > 0 && <span className={styles.count}>{total}</span>}
      </a>
      {open && (
        <div className={styles.menu} role="menu">
          {counts === null ? (
            <div className={styles.menuEmpty}>Loading…</div>
          ) : total === 0 ? (
            <div className={styles.menuEmpty}>Nothing pending.</div>
          ) : (
            <>
              <a className={styles.menuItem} href="/audit" role="menuitem">
                <span className={styles.menuLabel}>Sales</span>
                <span className={styles.menuCount}>{counts.sales}</span>
              </a>
              <a className={styles.menuItem} href="/audit" role="menuitem">
                <span className={styles.menuLabel}>Storage</span>
                <span className={styles.menuCount}>{counts.sh}</span>
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
