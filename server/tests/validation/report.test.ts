import { describe, it, expect } from 'vitest';
import { createReportSchema, REPORT_TYPES } from '../../validation/report.js';

describe('createReportSchema', () => {
  it('lists exactly four report types', () => {
    expect(REPORT_TYPES).toEqual([
      'delivery_sheet',
      'io_report',
      'pnl',
      'sh_statement',
    ]);
  });

  it('accepts a delivery_sheet payload with container_id', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: { container_id: 42 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a delivery_sheet payload missing container_id', () => {
    const r = createReportSchema.safeParse({
      report_type: 'delivery_sheet',
      parameters: {},
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
