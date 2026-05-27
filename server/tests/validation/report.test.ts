import { describe, it, expect } from 'vitest';
import { createReportSchema, REPORT_TYPES } from '../../validation/report.js';

describe('createReportSchema', () => {
  it('lists the supported report types', () => {
    expect(REPORT_TYPES).toEqual([
      'delivery_sheet',
      'io_report',
      'pnl',
      'sh_statement',
      'release_summary',
    ]);
  });

  it('accepts a release_summary with release_id', () => {
    const r = createReportSchema.safeParse({
      report_type: 'release_summary',
      parameters: { release_id: 42 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a release_summary missing release_id', () => {
    const r = createReportSchema.safeParse({
      report_type: 'release_summary',
      parameters: {},
    });
    expect(r.success).toBe(false);
  });

  it('accepts a delivery_sheet payload with just container_id (resolver fills defaults)', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: { container_id: 42 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a delivery_sheet payload missing both container_id and sh_box_id', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: {},
    });
    expect(r.success).toBe(false);
  });

  it('accepts a delivery_sheet for an S&H box (sh_box_id branch)', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: { sh_box_id: 12 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a delivery_sheet with both container_id and sh_box_id set', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: { container_id: 1, sh_box_id: 2 },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a delivery_sheet with the full operator-entered field set', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: {
        container_id: 42,
        delivery_date: '2026-04-12T13:30:00Z',
        delivery_company: 'JT Hauling Co.',
        onsite_contact: 'John Doe · 555-0142',
        door_orientation: 'Doors facing road',
        payment_details: 'Cash on delivery',
        receipt_note: 'Standard delivery — call 30 minutes out.',
        receipt_summary: '1 40\'HC Weather Tight Container',
        delivery_address: {
          name: 'John Doe',
          street: '418 Shoreline Dr',
          locality: 'Toms River, NJ 08753',
        },
        notes: 'Tight driveway — back in only',
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a delivery_sheet with client_id fallback (no invoice yet)', () => {
    // The edge path: container has no invoice, so the operator picks
    // the client directly. The resolver should skip the invoice join
    // and use this client_id when populating the customer block.
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: {
        container_id: 42,
        client_id: 7,
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a delivery_sheet with driver_contact captured at create time', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: {
        container_id: 42,
        driver_contact: {
          name: 'John Smith',
          phone: '(732) 861-4011',
          email: 'john@example.com',
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a delivery_sheet with partial driver_contact (phone only)', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: {
        container_id: 42,
        driver_contact: { phone: '732-861-4011' },
      },
    });
    expect(r.success).toBe(true);
  });

  it('treats an empty driver_contact email as null (operator typed nothing)', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: {
        container_id: 42,
        driver_contact: { phone: '732-861-4011', email: '' },
      },
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.report_type === 'delivery_sheet') {
      expect(r.data.parameters.driver_contact?.email).toBe(null);
    }
  });

  it('rejects a delivery_sheet with a malformed driver_contact.email', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: {
        container_id: 42,
        driver_contact: { email: 'not-an-email' },
      },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a delivery_sheet with a malformed delivery_address subfield', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: {
        container_id: 42,
        delivery_address: { name: 123 }, // not a string
      },
    });
    expect(r.success).toBe(false);
  });

  it('accepts an io_report with iso date strings', () => {
    const r = createReportSchema.safeParse({
      report_type: 'io_report',
      parameters: {
        start_date: '2026-01-01',
        end_date: '2026-01-31',
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects an io_report with a garbage date string', () => {
    const r = createReportSchema.safeParse({
      report_type: 'io_report',
      parameters: { start_date: 'tomorrow', end_date: '2026-02-01' },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a pnl payload with month granularity', () => {
    const r = createReportSchema.safeParse({
      report_type: 'pnl',
      parameters: { granularity: 'month', period: '2026-03' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a pnl with an unknown granularity', () => {
    const r = createReportSchema.safeParse({
      report_type: 'pnl',
      parameters: { granularity: 'weekly', period: '2026-W14' },
    });
    expect(r.success).toBe(false);
  });

  it('accepts an sh_statement with just client_id', () => {
    const r = createReportSchema.safeParse({
      report_type: 'sh_statement',
      parameters: { client_id: 7 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown report_type', () => {
    const r = createReportSchema.safeParse({
      report_type: 'profit_only',
      parameters: { foo: 'bar' },
    });
    expect(r.success).toBe(false);
  });

  it('accepts an optional emailed_to list of valid emails', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: { container_id: 1 },
      emailed_to: ['michelle@airtightstorage.com', 'driver@example.com'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects emailed_to containing an invalid address', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: { container_id: 1 },
      emailed_to: ['michelle@airtightstorage.com', 'not-an-email'],
    });
    expect(r.success).toBe(false);
  });
});
