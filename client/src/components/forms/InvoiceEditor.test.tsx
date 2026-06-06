import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvoiceEditor from './InvoiceEditor';
import type { InvoiceData } from '../templates/invoice/types';

// Minimal InvoiceData with one container and one preset modification.
// Mutation tests start from this shape.
const baseInvoice = (over: Partial<InvoiceData> = {}): InvoiceData => ({
  invoice_id: 1,
  invoice_number: 202605001,
  invoice_taxed: false,
  invoice_credit: false,
  invoice_date: '2026-05-15T00:00:00.000Z',
  sent_at: null,
  pdf_s3_key: null,
  deleted_at: null,
  status: 'draft',
  status_changed_at: null,
  status_changed_by_user_id: null,
  subtotal: '1500',
  tax_rate: null,
  tax_amount: null,
  cc_fee_rate: null,
  cc_fee_amount: null,
  total: '1500',
  ship_to_same_as_billing: true,
  ship_to_name: null,
  ship_to_street: null,
  ship_to_city: null,
  ship_to_state: null,
  ship_to_zip: null,
  customer: {
    id: 1,
    client_name: 'Test Client',
    business_name: null,
    contact_email: null,
    contact_phone: null,
    street: null,
    city: null,
    state: null,
    zip: null,
  },
  containers: [
    {
      inventory_id: 100,
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
      outbound_trucking_company_id: null,
      door_orientation: null,
      delivery_name: null,
      delivery_street: null,
      delivery_city: null,
      delivery_state: null,
      delivery_zip: null,
      modifications: [
        { id: 1, sold_id: 10, description: 'Roll-up door', price: '300', quantity: 1, position: 0 },
        { id: 2, sold_id: 10, description: 'Paint', price: '200', quantity: 1, position: 1 },
      ],
    },
  ],
  ...over,
});

// Dispatch fetch by URL so the various component-internal fetches all
// get sensible empty responses without one polluting the other.
const installFetchMock = () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
    const u = typeof url === 'string' ? url : (url as Request).url;
    const empty = { status: 'success', data: { clients: [], inventory: [] } };
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        u.includes('/api/v2/mod-presets')
          ? Promise.resolve({ status: 'success', data: { presets: [] } })
          : Promise.resolve(empty),
    } as Response);
  });
};

beforeEach(() => {
  vi.restoreAllMocks();
  installFetchMock();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InvoiceEditor', () => {
  it('renders initial customer + container data', async () => {
    render(
      <InvoiceEditor
        initial={baseInvoice()}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    // Customer name surfaces in the read-only fallback <option>
    expect(await screen.findByText('Test Client')).toBeInTheDocument();
    // Container header
    expect(screen.getByText('TCKU287291-3')).toBeInTheDocument();
    expect(screen.getByText(/40HC · WWT/)).toBeInTheDocument();
    // Both mods rendered
    expect(screen.getByDisplayValue('Roll-up door')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Paint')).toBeInTheDocument();
  });

  it('initial totals preview matches the sum of container fields', async () => {
    render(
      <InvoiceEditor
        initial={baseInvoice()}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    // 1500 sale + 300 mod + 200 mod = $2,000.00 subtotal & total (no tax/cc)
    await waitFor(() =>
      expect(screen.getAllByText('$2,000.00').length).toBeGreaterThanOrEqual(1),
    );
  });

  it('editing sale_price recomputes totals live', async () => {
    render(
      <InvoiceEditor
        initial={baseInvoice()}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    const saleInput = await screen.findByDisplayValue('1500');
    await userEvent.clear(saleInput);
    await userEvent.type(saleInput, '2500');
    // 2500 + 300 + 200 = $3,000
    await waitFor(() =>
      expect(screen.getAllByText('$3,000.00').length).toBeGreaterThanOrEqual(1),
    );
  });

  it('"+ Add modification" appends a blank mod row to the container', async () => {
    render(
      <InvoiceEditor
        initial={baseInvoice()}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getAllByPlaceholderText(/Description \(or pick a preset\)/)).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: '+ Add modification' }));
    expect(screen.getAllByPlaceholderText(/Description \(or pick a preset\)/)).toHaveLength(3);
  });

  it('removing a modification drops its row', async () => {
    render(
      <InvoiceEditor
        initial={baseInvoice()}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getByDisplayValue('Roll-up door')).toBeInTheDocument();
    const removeButtons = screen.getAllByRole('button', {
      name: 'Remove modification',
    });
    await userEvent.click(removeButtons[0]);
    expect(screen.queryByDisplayValue('Roll-up door')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Paint')).toBeInTheDocument();
  });

  it('Cancel calls onCancel without saving', async () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(
      <InvoiceEditor
        initial={baseInvoice()}
        onCancel={onCancel}
        onSave={onSave}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Save calls onSave with the mutated draft', async () => {
    const onSave = vi.fn();
    render(
      <InvoiceEditor
        initial={baseInvoice()}
        onCancel={() => {}}
        onSave={onSave}
      />,
    );
    const saleInput = await screen.findByDisplayValue('1500');
    await userEvent.clear(saleInput);
    await userEvent.type(saleInput, '9000');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledOnce();
    const draft = onSave.mock.calls[0][0] as InvoiceData;
    // CurrencyInput normalizes to 2 decimal places on blur.
    expect(draft.containers[0].sale_price).toBe('9000.00');
  });

  it('removing the only container shows the "No containers" warning', async () => {
    render(
      <InvoiceEditor
        initial={baseInvoice()}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove container' }),
    );
    expect(
      screen.getByText(/No containers on this invoice/),
    ).toBeInTheDocument();
  });
});
