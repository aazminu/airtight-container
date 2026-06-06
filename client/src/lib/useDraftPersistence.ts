import { useCallback, useEffect, useRef, useState } from 'react';

// Auto-persist an in-progress form to localStorage so a refresh, a
// misclick, or an iPad backgrounding the tab doesn't lose a half-filled
// quote/invoice. Complements useDirtyForm (which only *warns* on
// navigation) — this actually saves and restores.
//
// Usage:
//   const { hasDraft, clearDraft } = useDraftPersistence(
//     'airtight:draft:quote-create',
//     snapshot,          // a plain serializable object of the live form state
//     (saved) => { ...setState from saved... },  // restore, called once on mount
//   );
// Call clearDraft() on successful submit; wire a "Discard draft" button
// to clearDraft() + your own form reset.
export function useDraftPersistence<T>(
  key: string,
  snapshot: T,
  onRestore: (saved: T) => void,
) {
  const [hasDraft, setHasDraft] = useState(false);
  // Suppress the write effect until the one-time restore has run, so the
  // empty initial render can't clobber a saved draft.
  const writesEnabled = useRef(false);
  // onRestore is captured once; callers pass an inline closure that we
  // don't want to re-run on every render.
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        restoreRef.current(JSON.parse(raw) as T);
        setHasDraft(true);
      }
    } catch {
      // Corrupt/incompatible draft — drop it rather than wedge the form.
      localStorage.removeItem(key);
    }
    // Enable writes after the restore-triggered state updates have flushed.
    const t = setTimeout(() => {
      writesEnabled.current = true;
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!writesEnabled.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(snapshot));
        setHasDraft(true);
      } catch {
        // Quota or non-serializable value — best-effort, ignore.
      }
    }, 500);
    return () => clearTimeout(t);
  }, [key, snapshot]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(key);
    setHasDraft(false);
  }, [key]);

  return { hasDraft, clearDraft };
}
