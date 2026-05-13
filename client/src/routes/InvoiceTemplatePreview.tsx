import { useEffect, useMemo, useState } from 'react';
import InvoiceTemplate from '../components/templates/invoice/InvoiceTemplate';
import type { InvoiceData } from '../components/templates/invoice/types';
import styles from './InvoiceTemplatePreview.module.css';

interface ListResponse {
  status: string;
  results: number;
  data: { invoices: InvoiceData[] };
}

export default function InvoiceTemplatePreview() {
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/invoice', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ListResponse;
        if (cancelled) return;
        setInvoices(body.data.invoices);
        if (body.data.invoices.length > 0) {
          const preferred = body.data.invoices.find(
            (i) => i.invoice_number === 202604009,
          );
          setSelectedId((preferred ?? body.data.invoices[0]).invoice_id);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => invoices.find((i) => i.invoice_id === selectedId) ?? null,
    [invoices, selectedId],
  );

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarSection}>
          <div className={styles.label}>Invoice</div>
          <select
            className={styles.invoiceSelect}
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            disabled={loading || invoices.length === 0}
          >
            {invoices.map((i) => (
              <option key={i.invoice_id} value={i.invoice_id}>
                #{i.invoice_number} — {i.customer.business_name || i.customer.client_name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.toolbarSection}>
          <button
            type="button"
            className={styles.printBtn}
            onClick={() => window.print()}
            disabled={!selected}
          >
            Print preview
          </button>
        </div>
      </div>

      <div className={styles.stage}>
        {loading && <div className={styles.empty}>Loading invoices…</div>}
        {error && <div className={styles.error}>Error: {error}</div>}
        {!loading && !error && !selected && (
          <div className={styles.empty}>No invoices in the local DB to preview.</div>
        )}
        {selected && (
          <div className={styles.sheetWrap}>
            <InvoiceTemplate data={selected} />
          </div>
        )}
      </div>
    </div>
  );
}
