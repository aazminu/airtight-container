import { z } from 'zod';

// Validation for the reports system (Phase 5 PR 5.1).
//
// Each report_type has its own parameters shape. Anything else is
// rejected. Parameters live in a jsonb column so the schemas describe
// the shape rather than constrain it at the DB layer.
//
// Delivery sheet — happy path: the container has an invoice, so the
// resolver pulls customer + sold-row defaults via the inventory →
// invoice_containers → invoices → clients chain. Edge path (rare but
// real): a delivery sheet is generated for a container that hasn't
// been invoiced yet (e.g. a scheduled pickup before sale-close). In
// that case the form supplies client_id directly; the resolver skips
// the invoice join.
//
// All non-container_id fields below are optional. The PR 5.3 resolver
// fills DB defaults when a param is absent (sold.invoice_notes →
// receipt_note, sold.outbound_date → delivery_date, etc.) and uses
// the param value when present (operator override).

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

const deliveryAddress = z.object({
  name: z.string().trim().max(120).nullable().optional(),
  street: z.string().trim().max(200).nullable().optional(),
  locality: z.string().trim().max(200).nullable().optional(),
});

const deliverySheetParams = z.object({
  // Required: which container is being delivered.
  container_id: z.number().int().positive(),

  // Fallback when the container has no invoice yet (scheduled pickup
  // before sale-close). When omitted, the resolver derives the
  // customer from invoice_containers → invoices → clients.
  client_id: z.number().int().positive().optional(),

  // Day + time of delivery; falls back to sold.outbound_date.
  delivery_date: isoDate.optional(),

  // Operator-entered at form time. Not persisted on any inventory or
  // sold row — lives only in reports.parameters.
  delivery_company: z.string().trim().max(120).nullable().optional(),
  onsite_contact: z.string().trim().max(200).nullable().optional(),
  door_orientation: z.string().trim().max(120).nullable().optional(),
  payment_details: z.string().trim().max(200).nullable().optional(),

  // Optional overrides on DB-sourced defaults. When omitted the
  // resolver uses sold.invoice_notes (receipt_note) and a derived
  // "1 {size} Weather Tight Container" (receipt_summary).
  receipt_note: z.string().trim().max(500).nullable().optional(),
  receipt_summary: z.string().trim().max(120).nullable().optional(),

  // Override the delivery address (the customer's billing address
  // may not be where the box is going). Each subfield is optional;
  // the resolver fills missing pieces from the clients row.
  delivery_address: deliveryAddress.optional(),

  // Free-text notes block rendered below the form fields.
  notes: z.string().trim().max(1000).nullable().optional(),
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
