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

// Container numbers contain hyphens (ISO 6346 check-digit separator,
// e.g. TCKU287291-3). The default browser line-breaking algorithm
// treats hyphens as wrap points, so a long line can wrap such that the
// trailing check digit ends up alone on its own line. Swap ASCII
// hyphens for U+2011 NON-BREAKING HYPHEN to keep the unit number
// visually intact.
const NB_HYPHEN = '‑';
const protectUnitNumber = (un: string) => un.replace(/-/g, NB_HYPHEN);

// Parent-line description = `[Size] [Damage] [Unit#]`. Missing parts
// are skipped so legacy rows with no size/damage still render a clean
// unit number on its own.
const buildContainerDesc = (
  size: string | null | undefined,
  damage: string | null | undefined,
  safeUnit: string,
): string => {
  const parts: string[] = [];
  const s = (size ?? '').trim();
  if (s) parts.push(s);
  const d = (damage ?? '').trim();
  if (d) parts.push(d);
  parts.push(safeUnit);
  return parts.join(' ');
};

// One group per container. Primary = the container sale row; subs =
// optional modification and delivery rows. Templates render subs as
// visually-indented child rows under their parent.
//
// Modification sub-rows come from `container.modifications` (the
// `sold_modifications` table, ordered by `position`). For invoices
// pre-dating PR 3.4 (no per-mod line items in the database), fall
// back to the legacy `sold.modification_price` scalar.
export const buildLineGroups = (data: InvoiceData): InvoiceLineGroup[] => {
  const groups: InvoiceLineGroup[] = [];
  for (const c of data.containers) {
    const safeUnit = protectUnitNumber(c.unit_number);
    const containerDesc = buildContainerDesc(c.size, c.damage, safeUnit);
    const primary: InvoiceLine = {
      qty: 1,
      description: containerDesc,
      unitPrice: c.sale_price,
      lineTotal: c.sale_price,
    };
    const subs: InvoiceLine[] = [];
    const mods = Array.isArray(c.modifications) ? c.modifications : [];
    if (mods.length > 0) {
      for (const m of mods) {
        const qty = m.quantity || 1;
        subs.push({
          qty,
          description: m.description,
          unitPrice: qty > 1 ? m.price : null,
          lineTotal: String(Number(m.price ?? 0) * qty),
        });
      }
    } else {
      const legacyMod = Number(c.modification_price ?? 0);
      if (Number.isFinite(legacyMod) && legacyMod > 0) {
        subs.push({
          qty: 1,
          description: 'Modification',
          unitPrice: null,
          lineTotal: c.modification_price,
        });
      }
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
