import type { InvoiceData } from './types';

export const fmtCurrency = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const fmtCurrencyBare = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '0.00';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const fmtDate = (
  iso: string | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString(
    'en-US',
    opts ?? { year: 'numeric', month: 'long', day: 'numeric' },
  );
};

export const fmtDateISO = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().substring(0, 10);
};

// tax_rate / cc_fee_rate are stored as fractional decimals (0.06625 = 6.625%).
export const fmtRate = (rate: string | null | undefined): string => {
  if (!rate) return '';
  const n = Number(rate);
  if (!Number.isFinite(n)) return '';
  return `${(n * 100).toLocaleString('en-US', { maximumFractionDigits: 3 })}%`;
};

export interface InvoiceLine {
  qty: number;
  description: string;
  unitPrice: string | null;
  lineTotal: string | null;
}

export interface InvoiceLineGroup {
  primary: InvoiceLine;
  subs: InvoiceLine[];
}

// One group per container. Primary = the container sale row; subs =
// optional modification and delivery rows. Templates render subs as
// visually-indented child rows under their parent.
//
// Legacy schema stores a single scalar `sold.modification_price` per
// container, so today every container can produce at most one
// modification sub-row. The Phase 3 create-invoice flow will let
// admins enter modifications as separate line items (e.g. "paint
// job", "rollup door"). When that lands, this function should consume
// an array of mod entries per container; the rendering loop already
// handles N subs.
export const buildLineGroups = (data: InvoiceData): InvoiceLineGroup[] => {
  const groups: InvoiceLineGroup[] = [];
  for (const c of data.containers) {
    const notes = (c.invoice_notes ?? '').trim();
    const containerDesc = notes ? `${notes} ${c.unit_number}` : c.unit_number;
    const primary: InvoiceLine = {
      qty: 1,
      description: containerDesc,
      unitPrice: c.sale_price,
      lineTotal: c.sale_price,
    };
    const subs: InvoiceLine[] = [];
    const mod = Number(c.modification_price ?? 0);
    if (Number.isFinite(mod) && mod > 0) {
      subs.push({
        qty: 1,
        description: 'Modification',
        unitPrice: null,
        lineTotal: c.modification_price,
      });
    }
    const truck = Number(c.trucking_rate ?? 0);
    if (Number.isFinite(truck) && truck > 0) {
      subs.push({
        qty: 1,
        description: `Delivery to ${c.destination ?? '—'}`,
        unitPrice: null,
        lineTotal: c.trucking_rate,
      });
    }
    groups.push({ primary, subs });
  }
  return groups;
};

export const headlineDestination = (data: InvoiceData): string | null => {
  const dests = Array.from(
    new Set(
      data.containers
        .map((c) => c.destination)
        .filter((d): d is string => !!d && d.trim().length > 0),
    ),
  );
  if (dests.length === 0) return null;
  if (dests.length === 1) return dests[0];
  return dests.join(' / ');
};
