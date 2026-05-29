import { useContext, useEffect } from 'react';
import { userContext } from '../context/userContext';
import { useToast } from './ui';

// Legacy `setPopup(message)` was a blocking modal — bad UX, every
// success snapshot stole focus. This bridge forwards the same string
// state to the non-blocking Toast viewport instead. Existing
// `setPopup('Success!')` / `setPopup('ERROR Foo')` callsites keep
// working unchanged; the prefix convention selects the tone.
export default function PopupContainer() {
  const { popup, setPopup } = useContext(userContext);
  const { toast } = useToast();
  useEffect(() => {
    if (!popup) return;
    const isError = popup.substring(0, 5) === 'ERROR';
    const message = isError ? popup.substring(5).trim() || 'Something went wrong.' : popup;
    toast(message, { tone: isError ? 'error' : 'success' });
    setPopup('');
  }, [popup, setPopup, toast]);
  return null;
}
