import { describe, expect, it } from 'vitest';
import { buildLineGroups } from './format';
import type { InvoiceData, InvoiceLineContainer } from './types';

const baseContainer = (over: Partial<InvoiceLineContainer> = {}): InvoiceLineContainer => ({
  inventory_id: 1,
  sold_id: 10,
  unit_number: 'TCKU287291-3',
  state: 'sold',
  size: '40HC',
  damage: 'WWT',
  destination: null,
  trucking_rate: null,
  sale_price: '1500',
  modification_price: null,
  outbound_date: null,
  invoice_notes: null,
  modifications: [],
  ...over,
});

const baseInvoice = (containers: InvoiceLineContainer[]): InvoiceData => ({
  invoice_id: 1,
  invoice_number: 1,
  invoice_taxed: false,
  invoice_credit: false,
  invoice_date: '2026-05-01',
  sent_at: null,
  pdf_s3_key: null,
  subtotal: null,
  tax_rate: null,
  tax_amount: null,
  cc_fee_rate: null,
  cc_fee_amount: null,
  total: null,
  customer: {
    id: 1,
    client_name: 'Test',
    business_name: null,
    contact_email: null,
    contact_phone: null,
    street: null,
    city: null,
    state: null,
    zip: null,
  },
  containers,
});

describe('buildLineGroups', () => {
  it('emits one group per container with the sale price as the primary line', () => {
    const groups = buildLineGroups(baseInvoice([baseContainer()]));
    expect(groups).toHaveLength(1);
    expect(groups[0].primary.lineTotal).toBe('1500');
    expect(groups[0].subs).toEqual([]);
  });

  it('protects unit-number hyphens with U+2011 (non-breaking)', () => {
    const groups = buildLineGroups(baseInvoice([baseContainer()]));
    // TCKU287291-3 → with non-breaking hyphen between 1 and 3
    expect(groups[0].primary.description.includes('-')).toBe(false);
    expect(groups[0].primary.description.includes('‑')).toBe(true);
  });

  it('prepends [Size] [Damage] to the unit number on the parent line', () => {
    const groups = buildLineGroups(baseInvoice([baseContainer()]));
    // base container is 40HC / WWT / TCKU287291-3 → '40HC WWT TCKU…'
    expect(groups[0].primary.description.startsWith('40HC WWT ')).toBe(true);
  });

  it('skips missing size/damage parts cleanly', () => {
    const groups = buildLineGroups(
      baseInvoice([baseContainer({ size: '', damage: null })]),
    );
    // No size + no damage → just the unit number (no leading spaces)
    expect(groups[0].primary.description.startsWith(' ')).toBe(false);
    expect(groups[0].primary.description.includes('TCKU')).toBe(true);
  });

  it('ignores invoice_notes on the parent line (dropped in PR 9.3)', () => {
    const groups = buildLineGroups(
      baseInvoice([baseContainer({ invoice_notes: 'Custom paint job' })]),
    );
    expect(groups[0].primary.description.includes('Custom paint job')).toBe(false);
  });

  it('uses per-modification line items when present, ignoring legacy scalar', () => {
    const groups = buildLineGroups(
      baseInvoice([
        baseContainer({
          modification_price: '500', // legacy
          modifications: [
            {
              id: 1,
              sold_id: 10,
              description: 'Roll-up door',
              price: '300',
              position: 0,
            },
            {
              id: 2,
              sold_id: 10,
              description: 'Paint',
              price: '200',
              position: 1,
            },
          ],
        }),
      ]),
    );
    expect(groups[0].subs).toHaveLength(2);
    expect(groups[0].subs[0].description).toBe('Roll-up door');
    expect(groups[0].subs[0].lineTotal).toBe('300');
    expect(groups[0].subs[1].description).toBe('Paint');
  });

  it('falls back to legacy modification_price when modifications[] is empty', () => {
    const groups = buildLineGroups(
      baseInvoice([
        baseContainer({ modification_price: '500', modifications: [] }),
      ]),
    );
    expect(groups[0].subs).toHaveLength(1);
    expect(groups[0].subs[0].description).toBe('Modification');
    expect(groups[0].subs[0].lineTotal).toBe('500');
  });

  it('omits the legacy modification sub when modification_price is 0 or null', () => {
    const noneGroups = buildLineGroups(
      baseInvoice([baseContainer({ modification_price: null })]),
    );
    expect(noneGroups[0].subs).toHaveLength(0);

    const zeroGroups = buildLineGroups(
      baseInvoice([baseContainer({ modification_price: '0' })]),
    );
    expect(zeroGroups[0].subs).toHaveLength(0);
  });

  it('adds a delivery sub-row when trucking_rate > 0', () => {
    const groups = buildLineGroups(
      baseInvoice([
        baseContainer({ trucking_rate: '400', destination: 'Marlboro' }),
      ]),
    );
    expect(groups[0].subs).toHaveLength(1);
    expect(groups[0].subs[0].description).toBe('Delivery to Marlboro');
    expect(groups[0].subs[0].lineTotal).toBe('400');
  });

  it('combines per-mods + delivery when both are present', () => {
    const groups = buildLineGroups(
      baseInvoice([
        baseContainer({
          trucking_rate: '400',
          destination: 'Marlboro',
          modifications: [
            { id: 1, sold_id: 10, description: 'Paint', price: '200', position: 0 },
          ],
        }),
      ]),
    );
    expect(groups[0].subs.map((s) => s.description)).toEqual([
      'Paint',
      'Delivery to Marlboro',
    ]);
  });
});
