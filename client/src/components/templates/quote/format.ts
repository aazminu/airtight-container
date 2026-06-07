import type { QuoteData } from './types';

// Currency/date/rate helpers are identical in shape to the invoice
// formatters; re-export them so the quote template + flow share one
// implementation rather than forking a second copy.
export { fmtCurrency, fmtDate, fmtRate, fmtDateISO } from '../invoice/format';
import type { InvoiceLine, InvoiceLineGroup } from '../invoice/format';

export type QuoteLineRow = InvoiceLine;
export type QuoteLineGroup = InvoiceLineGroup;

// One group per quote line. Primary = the line itself; subs = optional
// modification + delivery rows, rendered as indented child rows. Mirrors
// buildLineGroups() in the invoice formatter, minus the
// size/damage/unit-number container description (quote lines are free
// text).
export const buildQuoteLineGroups = (data: QuoteData): QuoteLineGroup[] => {
  const groups: QuoteLineGroup[] = [];
  for (const line of data.lines) {
    const primary: QuoteLineRow = {
      qty: 1,
      description: line.description,
      unitPrice: line.sale_price,
      lineTotal: line.sale_price,
    };
    const subs: QuoteLineRow[] = [];
    const mods = Array.isArray(line.modifications) ? line.modifications : [];
    for (const m of mods) {
      const qty = m.quantity || 1;
      subs.push({
        qty,
        description: m.description,
        unitPrice: qty > 1 ? m.price : null,
        lineTotal: String(Number(m.price ?? 0) * qty),
      });
    }
    const truck = Number(line.trucking_rate ?? 0);
    if (Number.isFinite(truck) && truck > 0) {
      subs.push({
        qty: 1,
        description: `Delivery to ${line.destination ?? '—'}`,
        unitPrice: null,
        lineTotal: line.trucking_rate,
      });
    }
    groups.push({ primary, subs });
  }
  return groups;
};
