import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

// Guard unsaved form state two ways:
//   1. browser-level (tab close / refresh / external nav) via beforeunload
//   2. in-app navigation via react-router's data-router useBlocker
// Pass `dirty = true` while the form holds unsaved edits. Requires the app
// to use a data router (createBrowserRouter) — which it does.
export function useDirtyForm(
  dirty: boolean,
  message = 'You have unsaved changes. Leave without saving?',
): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(message)) blocker.proceed();
    else blocker.reset();
  }, [blocker, message]);
}
