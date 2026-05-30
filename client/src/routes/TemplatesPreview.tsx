import { useEffect, useMemo, useState } from 'react';
import InvoiceTemplate from '../components/templates/invoice/InvoiceTemplate';
import DeliveryTemplate from '../components/templates/delivery/DeliveryTemplate';
import IOReportTemplate from '../components/templates/io-report/IOReportTemplate';
import PnLTemplate from '../components/templates/pnl/PnLTemplate';
import ShStatementTemplate from '../components/templates/sh-statement/ShStatementTemplate';
import type { InvoiceData } from '../components/templates/invoice/types';
import type { DeliveryData } from '../components/templates/delivery/types';
import type { IOReportData } from '../components/templates/io-report/types';
import type { PnLData } from '../components/templates/pnl/types';
import type { ShStatementData } from '../components/templates/sh-statement/types';
import styles from './TemplatesPreview.module.css';

// Dev-only preview route. Renders any of the five printable templates
// with realistic data so we can visually check brand fidelity. Invoice
// + Delivery pull from real local-DB rows; the three aggregate reports
// (I/O, P&L, S&H statement) use synthesized fixtures here — PR 5.3 will
// add server resolvers that build the same shapes from real data.

type TemplateKey =
  | 'invoice'
  | 'delivery'
  | 'io_report'
  | 'pnl'
  | 'sh_statement';

interface ListResponse {
  status: string;
  results: number;
  data: { invoices: InvoiceData[] };
}

export default function TemplatesPreview() {
  const [templateKey, setTemplateKey] = useState<TemplateKey>('invoice');
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/invoice', { credentials: 'include' });
        if (!res.ok) throw new Error(`Something went wrong`);
        const body = (await res.json()) as ListResponse;
        if (cancelled) return;
        setInvoices(body.data.invoices);
        if (body.data.invoices.length > 0) {
          const preferred = body.data.invoices.find(
            (i) => i.invoice_number === 202604009,
          );
          setSelectedInvoiceId(
            (preferred ?? body.data.invoices[0]).invoice_id,
          );
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedInvoice = useMemo(
    () => invoices.find((i) => i.invoice_id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId],
  );

  const deliveryFixture = useMemo(
    () => buildDeliveryFixture(selectedInvoice),
    [selectedInvoice],
  );

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarSection}>
          <div className={styles.label}>Template</div>
          <select
            className={styles.invoiceSelect}
            value={templateKey}
            onChange={(e) => setTemplateKey(e.target.value as TemplateKey)}
          >
            <option value="invoice">Invoice</option>
            <option value="delivery">Delivery sheet</option>
            <option value="io_report">In/Out report</option>
            <option value="pnl">Profit + Loss</option>
            <option value="sh_statement">Storage &amp; Handling statement</option>
          </select>
        </div>

        {(templateKey === 'invoice' || templateKey === 'delivery') && (
          <div className={styles.toolbarSection}>
            <div className={styles.label}>Source invoice</div>
            <select
              className={styles.invoiceSelect}
              value={selectedInvoiceId ?? ''}
              onChange={(e) => setSelectedInvoiceId(Number(e.target.value))}
              disabled={loading || invoices.length === 0}
            >
              {invoices.map((i) => (
                <option key={i.invoice_id} value={i.invoice_id}>
                  #{i.invoice_number} —{' '}
                  {i.customer.business_name || i.customer.client_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.toolbarSection}>
          <button
            type="button"
            className={styles.printBtn}
            onClick={() => window.print()}
          >
            Print preview
          </button>
        </div>
      </div>

      <div className={styles.stage}>
        {loading && templateKey !== 'io_report' && templateKey !== 'pnl' && templateKey !== 'sh_statement' && (
          <div className={styles.empty}>Loading…</div>
        )}
        {error && <div className={styles.error}>Error: {error}</div>}

        <div className={styles.sheetWrap}>
          {templateKey === 'invoice' && selectedInvoice && (
            <InvoiceTemplate data={selectedInvoice} />
          )}
          {templateKey === 'delivery' && deliveryFixture && (
            <DeliveryTemplate data={deliveryFixture} />
          )}
          {templateKey === 'io_report' && (
            <IOReportTemplate data={IO_REPORT_FIXTURE} />
          )}
          {templateKey === 'pnl' && <PnLTemplate data={PNL_FIXTURE} />}
          {templateKey === 'sh_statement' && (
            <ShStatementTemplate data={SH_STATEMENT_FIXTURE} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Fixtures (PR 5.2 only; PR 5.3 swaps these for real server resolvers) ──

function buildDeliveryFixture(inv: InvoiceData | null): DeliveryData | null {
  if (!inv || inv.containers.length === 0) return null;
  const c = inv.containers[0];
  const cu = inv.customer;
  const locality =
    [cu.city, cu.state].filter(Boolean).join(', ') +
    (cu.zip ? ' ' + cu.zip : '');
  const sizePrefix = c.size?.slice(0, 3).trim() || c.size || '';
  return {
    delivery_id: `D-${inv.invoice_number}`,
    generated_at: new Date().toISOString(),
    delivery_date: c.outbound_date ?? new Date().toISOString(),
    customer: {
      business_name: cu.business_name,
      client_name: cu.client_name,
      contact_phone: cu.contact_phone,
      contact_email: cu.contact_email,
    },
    delivery_address: {
      name: null,
      street: c.destination || cu.street,
      locality: locality || null,
    },
    container: {
      unit_number: c.unit_number,
      size: c.size,
      damage: c.damage,
      release_number_value: null,
      sale_company_name: null,
      receipt_summary: `1 ${sizePrefix} Weather Tight Container`,
    },
    // PR 5.3 generator form will collect these. Preview uses realistic
    // placeholder values so we can verify the brand layout end-to-end.
    delivery_company: 'JT Hauling Co.',
    onsite_contact: 'John Doe · 555-0142',
    door_orientation: 'Doors facing road',
    payment_details: 'Cash on delivery',
    receipt_note: 'Standard delivery — call 30 minutes out.',
    notes: null,
    trucking: {
      company_name: 'Coastal Container Transport',
      dispatch_name: 'Maria Ortiz',
      dispatch_phone: '732-555-0188',
      dispatch_email: 'dispatch@coastalct.example',
    },
    driver_contact: null,
  };
}

const IO_REPORT_FIXTURE: IOReportData = {
  report_id: 'IO-PREVIEW',
  generated_at: new Date().toISOString(),
  start_date: '2026-03-01',
  end_date: '2026-03-31',
  inbound: [
    {
      unit_number: 'TCKU287291-3',
      size: "40'HC",
      date: '2026-03-04',
      party: 'SeaCube',
      release_number_value: 'P534112',
      source: 'sales',
    },
    {
      unit_number: 'DRYU933305-2',
      size: "40'HC",
      date: '2026-03-09',
      party: 'SeaCube',
      release_number_value: 'P683513',
      source: 'sales',
    },
    {
      unit_number: 'FAMU827154-7',
      size: "20'",
      date: '2026-03-15',
      party: 'Flex Box',
      release_number_value: 'FB05MNYC9',
      source: 'sales',
    },
    {
      unit_number: 'TRDU657649-3',
      size: "20'DV",
      date: '2026-03-22',
      party: 'Triton',
      release_number_value: 'ANYC$13294',
      source: 'sales',
    },
    {
      unit_number: 'CGMU100023-4',
      size: "40'HC",
      date: '2026-03-06',
      party: 'Lakeside Marina Co.',
      source: 'sh',
    },
    {
      unit_number: 'TGHU772212-1',
      size: "20'",
      date: '2026-03-18',
      party: 'Hudson Valley Co.',
      source: 'sh',
    },
  ],
  outbound: [
    {
      unit_number: 'RFCU401104-1',
      size: "40'HC",
      date: '2026-03-08',
      party: 'Belleayre Mountain · Highmount, NY',
      source: 'sales',
    },
    {
      unit_number: 'DRYU304922-3',
      size: '20',
      date: '2026-03-19',
      party: 'Hudson Valley Co. · Newburgh, NY',
      source: 'sales',
    },
    {
      unit_number: 'WBPU700005-4',
      size: "40'HC",
      date: '2026-03-27',
      party: 'Eastern Trade · Philadelphia, PA',
      source: 'sales',
    },
    {
      unit_number: 'CGMU100023-4',
      size: "40'HC",
      date: '2026-03-25',
      party: 'Lakeside Marina Co.',
      source: 'sh',
    },
  ],
};

const PNL_FIXTURE: PnLData = {
  report_id: 'PNL-PREVIEW',
  generated_at: new Date().toISOString(),
  period_label: 'March 2026',
  granularity: 'month',
  null_cost_count: 2,
  sales: {
    revenue: 42_800,
    cost: 18_200,
    mod_revenue: 6_400,
    mod_cost: 2_350,
    trucking: 4_200,
    container_count: 18,
  },
  sh: {
    revenue: 5_640,
    in_fee: 1_300,
    out_fee: 1_040,
    storage_days: 3_300,
    client_count: 12,
  },
};

const SH_STATEMENT_FIXTURE: ShStatementData = {
  report_id: 'SHS-PREVIEW',
  generated_at: new Date().toISOString(),
  start_date: '2026-01-01',
  end_date: '2026-03-31',
  client: {
    business_name: 'Lakeside Marina Co.',
    client_name: 'James Lake',
    street: '418 Shoreline Dr',
    city: 'Toms River',
    state: 'NJ',
    zip: '08753',
    contact_phone: '732-555-0142',
    contact_email: 'james@lakesidemarina.com',
  },
  lines: [
    {
      billing_month: '2026-01-01',
      invoice_number: 202601007,
      status: 'paid',
      in_fee: 65,
      out_fee: 0,
      storage_days: 620,
      total: 685,
    },
    {
      billing_month: '2026-02-01',
      invoice_number: 202602004,
      status: 'paid',
      in_fee: 0,
      out_fee: 0,
      storage_days: 560,
      total: 560,
    },
    {
      billing_month: '2026-03-01',
      invoice_number: 202603009,
      status: 'sent',
      in_fee: 0,
      out_fee: 65,
      storage_days: 620,
      total: 685,
    },
  ],
  totals: {
    in_fee: 65,
    out_fee: 65,
    storage_days: 1_800,
    total: 1_930,
  },
};
