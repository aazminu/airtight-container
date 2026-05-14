import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styles from './CreateReport.module.css';

type ReportType = 'delivery_sheet' | 'io_report' | 'pnl' | 'sh_statement';

const TYPE_LABELS: Record<ReportType, string> = {
  delivery_sheet: 'Delivery sheet',
  io_report: 'In / Out report',
  pnl: 'Profit + Loss',
  sh_statement: 'S&H statement',
};

const TYPE_DESCRIPTIONS: Record<ReportType, string> = {
  delivery_sheet:
    'One-pager handed to the driver at outbound. Pulls customer, container, and modifications from the invoice; takes operator-entered fields (delivery company, on-site contact, door orientation, payment details).',
  io_report:
    'Inbound + outbound activity over a date window. Includes container intake and sold-container delivery (sales) as well as S&H box check-ins and pickups.',
  pnl:
    'Profit + Loss for a month, quarter, or year. Sales revenue vs. acquisition + modification cost, plus S&H revenue.',
  sh_statement:
    'Per-client storage & handling statement. Lists every monthly invoice in a date window with in/out fees and storage-day charges.',
};

const TYPES: ReportType[] = ['delivery_sheet', 'io_report', 'pnl', 'sh_statement'];

function isReportType(v: string | undefined): v is ReportType {
  return v != null && (TYPES as string[]).includes(v);
}

export default function CreateReport() {
  const { type } = useParams<{ type?: string }>();
  const navigate = useNavigate();

  // No type → show the picker.
  if (!type) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>New report</h1>
          <p className={styles.subtitle}>What kind of report?</p>
        </header>
        <div className={styles.picker}>
          {TYPES.map((t) => (
            <Link key={t} to={`/reports/new/${t}`} className={styles.pickerCard}>
              <div className={styles.pickerLabel}>{TYPE_LABELS[t]}</div>
              <p className={styles.pickerDesc}>{TYPE_DESCRIPTIONS[t]}</p>
            </Link>
          ))}
        </div>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => navigate('/reports')}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (!isReportType(type)) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Unknown report type</h1>
          <p className={styles.subtitle}>"{type}" is not a valid report.</p>
        </header>
        <Link to="/reports/new" className={styles.cancel}>
          ← Back
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{TYPE_LABELS[type]}</h1>
        <p className={styles.subtitle}>{TYPE_DESCRIPTIONS[type]}</p>
      </header>
      {type === 'delivery_sheet' && <DeliveryForm />}
      {type === 'io_report' && <IoForm />}
      {type === 'pnl' && <PnlForm />}
      {type === 'sh_statement' && <ShStatementForm />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Shared submit helper
// ──────────────────────────────────────────────────────────────────────

async function submitReport(
  report_type: ReportType,
  parameters: Record<string, unknown>,
): Promise<{ id: number } | { error: string }> {
  try {
    const res = await fetch('/api/v2/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ report_type, parameters }),
    });
    const body = await res.json();
    if (!res.ok) {
      return { error: body?.message ?? `HTTP ${res.status}` };
    }
    return { id: body?.data?.report?.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Delivery sheet form
// ──────────────────────────────────────────────────────────────────────

interface InventoryRow {
  id: number;
  unit_number: string;
  size: string;
  state: string;
  client_name?: string | null;
}

function DeliveryForm() {
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [containerId, setContainerId] = useState<number | null>(null);
  const [clientId, setClientId] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryCompany, setDeliveryCompany] = useState('');
  const [onsiteContact, setOnsiteContact] = useState('');
  const [doorOrientation, setDoorOrientation] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [receiptNote, setReceiptNote] = useState('');
  const [receiptSummary, setReceiptSummary] = useState('');
  const [addrName, setAddrName] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrLocality, setAddrLocality] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/inventory', { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setInventory(body?.data?.inventory ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory
      .filter(
        (r) =>
          r.state === 'sold' ||
          r.state === 'outbound' ||
          r.state === 'available',
      )
      .filter(
        (r) =>
          !q ||
          r.unit_number?.toLowerCase().includes(q) ||
          r.size?.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [inventory, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!containerId) {
      setError('Pick a container first.');
      return;
    }
    setBusy(true);
    const params: Record<string, unknown> = { container_id: containerId };
    if (clientId) params.client_id = parseInt(clientId, 10);
    if (deliveryDate) params.delivery_date = new Date(deliveryDate).toISOString();
    if (deliveryCompany.trim()) params.delivery_company = deliveryCompany.trim();
    if (onsiteContact.trim()) params.onsite_contact = onsiteContact.trim();
    if (doorOrientation.trim()) params.door_orientation = doorOrientation.trim();
    if (paymentDetails.trim()) params.payment_details = paymentDetails.trim();
    if (receiptNote.trim()) params.receipt_note = receiptNote.trim();
    if (receiptSummary.trim()) params.receipt_summary = receiptSummary.trim();
    if (notes.trim()) params.notes = notes.trim();
    const addr: Record<string, string> = {};
    if (addrName.trim()) addr.name = addrName.trim();
    if (addrStreet.trim()) addr.street = addrStreet.trim();
    if (addrLocality.trim()) addr.locality = addrLocality.trim();
    if (Object.keys(addr).length > 0) params.delivery_address = addr;

    const result = await submitReport('delivery_sheet', params);
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    navigate(`/reports/${result.id}`);
  };

  const selected = useMemo(
    () => inventory.find((r) => r.id === containerId) ?? null,
    [inventory, containerId],
  );

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Section title="Container" required>
        <input
          type="search"
          className={styles.input}
          placeholder="Search by unit number or size…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.containerList}>
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`${styles.containerOption} ${containerId === r.id ? styles.containerSelected : ''}`}
              onClick={() => setContainerId(r.id)}
            >
              <span className={styles.containerUnit}>
                {r.unit_number.trim()}
              </span>
              <span className={styles.containerMeta}>
                {r.size} · {r.state}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className={styles.containerEmpty}>
              No matching containers.
            </div>
          )}
        </div>
        {selected && (
          <div className={styles.containerPicked}>
            Picked: <strong>{selected.unit_number.trim()}</strong> ({selected.size})
          </div>
        )}
      </Section>

      <Section
        title="Client fallback (only if container has no invoice yet)"
        hint="Leave blank when the container is already linked to an invoice — we'll pull the customer automatically."
      >
        <input
          type="number"
          className={styles.input}
          placeholder="client_id"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        />
      </Section>

      <Section title="Delivery details">
        <Grid>
          <Field label="Delivery date / time">
            <input
              type="datetime-local"
              className={styles.input}
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </Field>
          <Field label="Delivery company">
            <input
              type="text"
              className={styles.input}
              value={deliveryCompany}
              onChange={(e) => setDeliveryCompany(e.target.value)}
              placeholder="JT Hauling Co."
            />
          </Field>
          <Field label="On-site contact">
            <input
              type="text"
              className={styles.input}
              value={onsiteContact}
              onChange={(e) => setOnsiteContact(e.target.value)}
              placeholder="John Doe · 555-0142"
            />
          </Field>
          <Field label="Door orientation">
            <input
              type="text"
              className={styles.input}
              value={doorOrientation}
              onChange={(e) => setDoorOrientation(e.target.value)}
              placeholder="Doors facing road"
            />
          </Field>
          <Field label="Payment details" wide>
            <input
              type="text"
              className={styles.input}
              value={paymentDetails}
              onChange={(e) => setPaymentDetails(e.target.value)}
              placeholder="Cash on delivery"
            />
          </Field>
        </Grid>
      </Section>

      <Section title="Delivery address (override)" hint="Auto-filled from the customer's billing address if left blank; warn-only — many deliveries don't match the bill-to.">
        <Grid>
          <Field label="Recipient name on site">
            <input
              type="text"
              className={styles.input}
              value={addrName}
              onChange={(e) => setAddrName(e.target.value)}
            />
          </Field>
          <Field label="Street">
            <input
              type="text"
              className={styles.input}
              value={addrStreet}
              onChange={(e) => setAddrStreet(e.target.value)}
            />
          </Field>
          <Field label="City, State Zip" wide>
            <input
              type="text"
              className={styles.input}
              value={addrLocality}
              onChange={(e) => setAddrLocality(e.target.value)}
              placeholder="Toms River, NJ 08753"
            />
          </Field>
        </Grid>
      </Section>

      <Section title="Receipt block">
        <Grid>
          <Field label="Receipt note" wide>
            <input
              type="text"
              className={styles.input}
              value={receiptNote}
              onChange={(e) => setReceiptNote(e.target.value)}
              placeholder='Defaults to the invoice note. "Standard delivery — call 30 minutes out."'
            />
          </Field>
          <Field label="Receipt summary override" wide>
            <input
              type="text"
              className={styles.input}
              value={receiptSummary}
              onChange={(e) => setReceiptSummary(e.target.value)}
              placeholder='Defaults to "1 {size} Weather Tight Container"'
            />
          </Field>
        </Grid>
      </Section>

      <Section title="Free-text notes">
        <textarea
          className={styles.textarea}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Tight driveway — back in only"
        />
      </Section>

      <SubmitRow error={error} busy={busy} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
// In/Out form
// ──────────────────────────────────────────────────────────────────────

function IoForm() {
  const navigate = useNavigate();
  const [start, setStart] = useState(() =>
    new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
  );
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await submitReport('io_report', {
      start_date: start,
      end_date: end,
    });
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    navigate(`/reports/${result.id}`);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Section title="Date window">
        <Grid>
          <Field label="Start date">
            <input
              type="date"
              className={styles.input}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              className={styles.input}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </Field>
        </Grid>
      </Section>
      <SubmitRow error={error} busy={busy} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
// P&L form
// ──────────────────────────────────────────────────────────────────────

function PnlForm() {
  const navigate = useNavigate();
  const [granularity, setGranularity] = useState<'month' | 'quarter' | 'year'>(
    'month',
  );
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [quarter, setQuarter] = useState<number>(
    Math.floor(now.getMonth() / 3) + 1,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const period = useMemo(() => {
    if (granularity === 'month') return `${year}-${String(month).padStart(2, '0')}`;
    if (granularity === 'quarter') return `${year}-Q${quarter}`;
    return `${year}`;
  }, [granularity, year, month, quarter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await submitReport('pnl', { granularity, period });
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    navigate(`/reports/${result.id}`);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Section title="Period">
        <Grid>
          <Field label="Granularity">
            <select
              className={styles.input}
              value={granularity}
              onChange={(e) =>
                setGranularity(e.target.value as 'month' | 'quarter' | 'year')
              }
            >
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
              <option value="year">Year</option>
            </select>
          </Field>
          <Field label="Year">
            <input
              type="number"
              className={styles.input}
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || year)}
              min={2000}
              max={2100}
              required
            />
          </Field>
          {granularity === 'month' && (
            <Field label="Month">
              <select
                className={styles.input}
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              >
                {[
                  'January',
                  'February',
                  'March',
                  'April',
                  'May',
                  'June',
                  'July',
                  'August',
                  'September',
                  'October',
                  'November',
                  'December',
                ].map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {granularity === 'quarter' && (
            <Field label="Quarter">
              <select
                className={styles.input}
                value={quarter}
                onChange={(e) => setQuarter(parseInt(e.target.value, 10))}
              >
                <option value={1}>Q1 (Jan – Mar)</option>
                <option value={2}>Q2 (Apr – Jun)</option>
                <option value={3}>Q3 (Jul – Sep)</option>
                <option value={4}>Q4 (Oct – Dec)</option>
              </select>
            </Field>
          )}
        </Grid>
        <div className={styles.hint}>Period key: {period}</div>
      </Section>
      <SubmitRow error={error} busy={busy} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
// S&H statement form
// ──────────────────────────────────────────────────────────────────────

interface ClientRow {
  id: number;
  client_name: string;
  business_name: string | null;
}

function ShStatementForm() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v2/client', { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setClients(body?.data?.clients ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter(
        (c) =>
          !q ||
          c.client_name?.toLowerCase().includes(q) ||
          c.business_name?.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [clients, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!clientId) {
      setError('Pick a client first.');
      return;
    }
    setBusy(true);
    const params: Record<string, unknown> = { client_id: clientId };
    if (start) params.start_date = start;
    if (end) params.end_date = end;
    const result = await submitReport('sh_statement', params);
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    navigate(`/reports/${result.id}`);
  };

  const selected = clients.find((c) => c.id === clientId);

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Section title="Client" required>
        <input
          type="search"
          className={styles.input}
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.containerList}>
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`${styles.containerOption} ${clientId === c.id ? styles.containerSelected : ''}`}
              onClick={() => setClientId(c.id)}
            >
              <span className={styles.containerUnit}>
                {c.business_name || c.client_name}
              </span>
              {c.business_name && c.client_name !== c.business_name && (
                <span className={styles.containerMeta}>{c.client_name}</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className={styles.containerEmpty}>No matching clients.</div>
          )}
        </div>
        {selected && (
          <div className={styles.containerPicked}>
            Picked:{' '}
            <strong>{selected.business_name || selected.client_name}</strong>
          </div>
        )}
      </Section>

      <Section title="Date window (optional)">
        <Grid>
          <Field label="Start date">
            <input
              type="date"
              className={styles.input}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              className={styles.input}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </Grid>
      </Section>

      <SubmitRow error={error} busy={busy} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Layout helpers
// ──────────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
  required,
  hint,
}: {
  title: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {title}
        {required && <span className={styles.required}> *</span>}
      </h2>
      {hint && <p className={styles.sectionHint}>{hint}</p>}
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`${styles.field} ${wide ? styles.fieldWide : ''}`}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function SubmitRow({ error, busy }: { error: string | null; busy: boolean }) {
  const navigate = useNavigate();
  return (
    <>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.submitRow}>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => navigate('/reports')}
        >
          Cancel
        </button>
        <button type="submit" className={styles.submit} disabled={busy}>
          {busy ? 'Generating…' : 'Generate report'}
        </button>
      </div>
    </>
  );
}
