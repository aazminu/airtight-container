import { Modal } from '../ui';
import { ClientForm, type Client } from './ClientForm';

// Inline "+ New Client": wraps ClientForm in a modal, persists the new
// client, and hands the created row back to the calling flow so it can
// re-select it without losing in-flight state. Reused anywhere a client
// picker lives (invoice create, quote create, …).
interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (client: Client & { id: number }) => void;
}

export function AddClientModal({ open, onClose, onCreated }: Props) {
  const handleSubmit = async (c: Client) => {
    const res = await fetch('/api/v2/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ customer: c }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message ?? 'Could not create client');
    }
    const body = await res.json();
    if (body?.client) onCreated(body.client as Client & { id: number });
    onClose();
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="New client" size="lg">
      <ClientForm onSubmit={handleSubmit} onCancel={onClose} />
    </Modal>
  );
}
