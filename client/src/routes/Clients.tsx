import { useEffect, useMemo, useState } from 'react';
import { Button, Modal } from '../components/ui';
import { ClientForm } from '../components/forms/ClientForm';
import type { Client } from '../components/forms/ClientForm';
import styles from './Clients.module.css';

interface ApiResponse {
  status: string;
  results: number;
  data: { clients: Client[] };
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/clients', { credentials: 'include' });
      if (!res.ok) throw new Error(`Something went wrong`);
      const body = (await res.json()) as ApiResponse;
      setClients(body.data.clients);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) =>
      [c.client_name, c.business_name, c.contact_email, c.contact_phone, c.city, c.state, c.zip]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [clients, search]);

  const handleCreate = async (c: Client) => {
    const res = await fetch('/api/v2/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ customer: c }),
    });
    if (!res.ok) throw new Error('Create failed');
    setCreating(false);
    await load();
  };

  const handleUpdate = async (c: Client) => {
    if (!editing?.id) return;
    const res = await fetch(`/api/v2/clients/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ editedClient: c }),
    });
    if (!res.ok) throw new Error('Save failed');
    setEditing(null);
    await load();
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Clients</h1>
          <p className={styles.subtitle}>
            {loading ? 'Loading…' : `${filtered.length} of ${clients.length}`}
          </p>
        </div>
        <div className={styles.headerActions}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search name, email, city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button onClick={() => setCreating(true)}>+ New client</Button>
        </div>
      </header>

      {error && <div className={styles.error}>Failed to load clients: {error}</div>}

      <div className={styles.grid}>
        {filtered.map((c) => (
          <button
            key={c.id}
            className={styles.card}
            onClick={() => setEditing(c)}
            type="button"
          >
            <div className={styles.cardHead}>
              <span className={styles.cardName}>{c.client_name}</span>
              {c.business_name && (
                <span className={styles.cardBiz}>{c.business_name}</span>
              )}
            </div>
            <div className={styles.cardBody}>
              {c.contact_email && <div className={styles.line}>{c.contact_email}</div>}
              {c.contact_phone && <div className={styles.line}>{c.contact_phone}</div>}
              {(c.street || c.city) && (
                <div className={styles.lineMuted}>
                  {[c.street, [c.city, c.state].filter(Boolean).join(', '), c.zip]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </div>
          </button>
        ))}
        {!loading && filtered.length === 0 && (
          <div className={styles.empty}>No clients match your search.</div>
        )}
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Add a client"
        size="lg"
      >
        <ClientForm onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.client_name}` : ''}
        size="lg"
      >
        <ClientForm
          initial={editing}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      </Modal>
    </div>
  );
}
