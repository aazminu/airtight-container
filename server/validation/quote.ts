import { z } from 'zod';

// Validation for the quote create/update endpoints. Numeric money
// fields accept strings (the FE sends raw input strings) or numbers and
// are kept as-is; pg's numeric column stores them losslessly. Rates are
// stored as fractional decimals (0.06625 = 6.625%), same as invoices.

const moneyish = z
  .union([z.string(), z.number()])
  .nullable()
  .optional();

const quoteModSchema = z.object({
  description: z.string().trim().max(500).optional(),
  price: moneyish,
  position: z.number().int().optional().nullable(),
});

const quoteLineSchema = z.object({
  description: z.string().trim().max(500).optional(),
  sale_price: moneyish,
  trucking_rate: moneyish,
  destination: z.string().trim().max(255).nullable().optional(),
  position: z.number().int().optional().nullable(),
  modifications: z.array(quoteModSchema).max(50).optional(),
});

export const createQuoteSchema = z.object({
  client_id: z.coerce.number().int().positive(),
  quote_taxed: z.boolean().optional(),
  quote_credit: z.boolean().optional(),
  tax_rate: moneyish,
  cc_fee_rate: moneyish,
  notes: z.string().trim().max(5000).nullable().optional(),
  lines: z.array(quoteLineSchema).max(200).optional(),
});

export const updateQuoteSchema = z.object({
  client_id: z.coerce.number().int().positive().optional(),
  quote_taxed: z.boolean().optional(),
  quote_credit: z.boolean().optional(),
  tax_rate: moneyish,
  cc_fee_rate: moneyish,
  notes: z.string().trim().max(5000).nullable().optional(),
  lines: z.array(quoteLineSchema).max(200),
});

export const emailQuoteSchema = z.object({
  to: z.string().email().max(320).optional(),
});

// Promote a quote into a new invoice. `containers` is the chosen
// inventory rows in mapping order; an optional `line_id` per container
// pins it to a specific quote line (otherwise pairing is positional).
// Promote also carries optional invoice ship-to + per-container delivery
// details collected on the promote stepper so the spawned invoice +
// sold rows land fully populated and the downstream delivery sheet
// can autofill without a second pass through the InvoiceEditor.
const nullableShortText = z.string().trim().max(255).nullable().optional();

export const promoteQuoteSchema = z.object({
  ship_to_same_as_billing: z.boolean().optional(),
  ship_to_name: nullableShortText,
  ship_to_street: nullableShortText,
  ship_to_city: nullableShortText,
  ship_to_state: nullableShortText,
  ship_to_zip: nullableShortText,
  containers: z
    .array(
      z.object({
        inventory_id: z.coerce.number().int().positive(),
        line_id: z.coerce.number().int().positive().nullable().optional(),
        outbound_trucking_company_id: z.coerce
          .number()
          .int()
          .positive()
          .nullable()
          .optional(),
        door_orientation: nullableShortText,
        delivery_name: nullableShortText,
        delivery_street: nullableShortText,
        delivery_city: nullableShortText,
        delivery_state: nullableShortText,
        delivery_zip: nullableShortText,
      }),
    )
    .min(1)
    .max(200),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type PromoteQuoteInput = z.infer<typeof promoteQuoteSchema>;
