import { z } from 'zod';

// Validation for the reports system (Phase 5 PR 5.1).
//
// Each report_type has its own parameters shape:
//   delivery_sheet   — { container_id: number, outbound_date?: string }
//   io_report        — { start_date: string, end_date: string }
//   pnl              — { granularity: 'month'|'quarter'|'year',
//                         period: string (e.g. '2026-Q1') }
//   sh_statement     — { client_id: number, start_date?, end_date? }
//
// Anything else is rejected. Parameters live in a jsonb column so the
// schemas describe the shape rather than constrain it at the DB layer.

export const REPORT_TYPES = [
  'delivery_sheet',
  'io_report',
  'pnl',
  'sh_statement',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

const isoDate = z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), {
  message: 'Must be an ISO date string',
});

const deliverySheetParams = z.object({
  container_id: z.number().int().positive(),
  outbound_date: isoDate.optional(),
});

const ioReportParams = z.object({
  start_date: isoDate,
  end_date: isoDate,
});

const pnlParams = z.object({
  granularity: z.enum(['month', 'quarter', 'year']),
  period: z.string().min(4).max(20),
});

const shStatementParams = z.object({
  client_id: z.number().int().positive(),
  start_date: isoDate.optional(),
  end_date: isoDate.optional(),
});

export const createReportSchema = z.discriminatedUnion('report_type', [
  z.object({
    report_type: z.literal('delivery_sheet'),
    parameters: deliverySheetParams,
    emailed_to: z.array(z.string().email()).optional(),
  }),
  z.object({
    report_type: z.literal('io_report'),
    parameters: ioReportParams,
    emailed_to: z.array(z.string().email()).optional(),
  }),
  z.object({
    report_type: z.literal('pnl'),
    parameters: pnlParams,
    emailed_to: z.array(z.string().email()).optional(),
  }),
  z.object({
    report_type: z.literal('sh_statement'),
    parameters: shStatementParams,
    emailed_to: z.array(z.string().email()).optional(),
  }),
]);

export type CreateReportInput = z.infer<typeof createReportSchema>;
