import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import InvoicesGrid from './InvoicesGrid';
import type { InvoiceData } from '../templates/invoice/types';

// Lightweight InvoiceData factory. Only the fields the grid actually
// reads are filled; everything else gets a null/0/empty default so the
// type checker is happy.
const makeInvoice = (over: Partial<InvoiceData> & { customer_id?: number }): InvoiceData => {
  const customerId = over.customer_id ?? 1;
  return {
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
    subtotal: '0',
    tax_rate: null,
    tax_amount: null,
    cc_fee_rate: null,
    cc_fee_amount: null,
    total: '1500',
    customer: {
      id: customerId,
      client_name: `Client ${customerId}`,
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
        modifications: [],
      },
    ],
    ...over,
  };
};

const mockFetch = (invoices: InvoiceData[]) => {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        status: 'success',
        results: invoices.length,
        data: { invoices },
      }),
  } as Response);
};

const renderGrid = () =>
  render(
    <MemoryRouter>
      <InvoicesGrid />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InvoicesGrid', () => {
  it('renders all invoices as tiles after the fetch resolves', async () => {
    mockFetch([
      makeInvoice({ invoice_id: 1, invoice_number: 202605001, customer_id: 1 }),
      makeInvoice({ invoice_id: 2, invoice_number: 202605002, customer_id: 2 }),
      makeInvoice({ invoice_id: 3, invoice_number: 202605003, customer_id: 1 }),
    ]);
    renderGrid();
    await waitFor(() =>
      expect(screen.getByText(/3 of 3 invoices/)).toBeInTheDocument(),
    );
    expect(screen.getByText('#202605001')).toBeInTheDocument();
    expect(screen.getByText('#202605002')).toBeInTheDocument();
    expect(screen.getByText('#202605003')).toBeInTheDocument();
  });

  it('search narrows the tile grid', async () => {
    mockFetch([
      makeInvoice({ invoice_id: 1, invoice_number: 202605001, customer_id: 1 }),
      makeInvoice({ invoice_id: 2, invoice_number: 202605002, customer_id: 2 }),
    ]);
    renderGrid();
    await waitFor(() =>
      expect(screen.getByText(/2 of 2 invoices/)).toBeInTheDocument(),
    );
    await userEvent.type(
      screen.getByPlaceholderText(/search invoice/i),
      '202605001',
    );
    await waitFor(() =>
      expect(screen.getByText(/1 of 2 invoice/)).toBeInTheDocument(),
    );
    expect(screen.getByText('#202605001')).toBeInTheDocument();
    expect(screen.queryByText('#202605002')).not.toBeInTheDocument();
  });

  it('sidebar buckets narrow when search filters out their invoices', async () => {
    mockFetch([
      makeInvoice({ invoice_id: 1, invoice_number: 202605001, customer_id: 1 }),
      makeInvoice({ invoice_id: 2, invoice_number: 202605002, customer_id: 2 }),
    ]);
    renderGrid();
    const sidebar = await screen.findByLabelText('Filter invoices');
    expect(within(sidebar).getByText('Client 1')).toBeInTheDocument();
    expect(within(sidebar).getByText('Client 2')).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText(/search invoice/i),
      '202605001',
    );
    await waitFor(() =>
      expect(within(sidebar).queryByText('Client 2')).not.toBeInTheDocument(),
    );
    expect(within(sidebar).getByText('Client 1')).toBeInTheDocument();
  });

  it('clicking a sidebar client filters tiles to that client only', async () => {
    mockFetch([
      makeInvoice({ invoice_id: 1, invoice_number: 202605001, customer_id: 1 }),
      makeInvoice({ invoice_id: 2, invoice_number: 202605002, customer_id: 2 }),
      makeInvoice({ invoice_id: 3, invoice_number: 202605003, customer_id: 1 }),
    ]);
    renderGrid();
    const sidebar = await screen.findByLabelText('Filter invoices');
    await userEvent.click(within(sidebar).getByText('Client 1'));
    await waitFor(() =>
      expect(screen.getByText(/2 of 3 invoices/)).toBeInTheDocument(),
    );
    expect(screen.getByText('#202605001')).toBeInTheDocument();
    expect(screen.queryByText('#202605002')).not.toBeInTheDocument();
    expect(screen.getByText('#202605003')).toBeInTheDocument();
  });

  it('snaps the active client filter back to All when search makes that client disappear', async () => {
    mockFetch([
      makeInvoice({ invoice_id: 1, invoice_number: 202605001, customer_id: 1 }),
      makeInvoice({ invoice_id: 2, invoice_number: 202605002, customer_id: 2 }),
    ]);
    renderGrid();
    const sidebar = await screen.findByLabelText('Filter invoices');
    await userEvent.click(within(sidebar).getByText('Client 2'));
    await waitFor(() =>
      expect(screen.getByText(/1 of 2 invoice/)).toBeInTheDocument(),
    );
    // Type a search that excludes Client 2's invoice.
    await userEvent.type(
      screen.getByPlaceholderText(/search invoice/i),
      '202605001',
    );
    // The filter should snap back to All; search narrows on top of that.
    await waitFor(() =>
      expect(screen.getByText(/1 of 2 invoice/)).toBeInTheDocument(),
    );
    expect(screen.getByText('#202605001')).toBeInTheDocument();
  });

  it('renders a Deleted badge on tombstoned tiles (PR 9.5 behavior)', async () => {
    mockFetch([
      makeInvoice({
        invoice_id: 1,
        invoice_number: 202605001,
        deleted_at: '2026-05-16T12:00:00.000Z',
        containers: [],
      }),
    ]);
    renderGrid();
    expect(await screen.findByText('Deleted')).toBeInTheDocument();
    expect(screen.queryByText('Sent')).not.toBeInTheDocument();
    expect(screen.queryByText('Unsent')).not.toBeInTheDocument();
    expect(screen.getByText('No containers')).toBeInTheDocument();
  });

  it('renders an empty state when there are no invoices', async () => {
    mockFetch([]);
    renderGrid();
    expect(await screen.findByText('No invoices yet.')).toBeInTheDocument();
  });

  it('renders pagination controls only when results exceed one page', async () => {
    // 24 invoices = exactly one page → no pagination
    const onePage = Array.from({ length: 24 }, (_, i) =>
      makeInvoice({
        invoice_id: i + 1,
        invoice_number: 202605000 + i + 1,
        customer_id: (i % 3) + 1,
      }),
    );
    mockFetch(onePage);
    const { unmount } = renderGrid();
    await waitFor(() =>
      expect(screen.getByText(/24 of 24/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Page \d+ of/)).not.toBeInTheDocument();
    unmount();

    // 25 invoices = two pages → pagination shows
    const twoPages = Array.from({ length: 25 }, (_, i) =>
      makeInvoice({
        invoice_id: i + 1,
        invoice_number: 202605000 + i + 1,
        customer_id: (i % 3) + 1,
      }),
    );
    vi.restoreAllMocks();
    mockFetch(twoPages);
    renderGrid();
    await waitFor(() =>
      expect(screen.getByText(/25 of 25/)).toBeInTheDocument(),
    );
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('shows an error banner when the fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response);
    renderGrid();
    expect(
      await screen.findByText(/failed to load invoices/i),
    ).toBeInTheDocument();
  });
});
