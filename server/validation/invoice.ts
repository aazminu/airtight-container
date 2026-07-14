import { z } from 'zod';

// Validation for the sales-invoice create/update endpoints. Mirrors the
// server's own IncomingContainer / UpdateInvoiceBody / CreateInvoiceBody
// contracts (lib/invoice-ops.ts) field-for-field: validateBody strips
// unknown keys, so anything the write path reads must be listed here or
// it would be silently dropped. Money fields accept the raw strings the
// FE sends (pg numeric stores them losslessly) and permit negatives
// (discount / credit lines). Modification quantity must be a whole number
// >= 1 — the one place we tighten, since a 0/negative qty would corrupt
// the recomputed total.

const moneyish = z.union([z.string(), z.number()]).nullable().optional();
const nullableShortText = z.string().trim().max(255).nullable().optional();

const invoiceModSchema = z.object({
  description: z.string().trim().max(500).optional(),
  price: moneyish,
  quantity: z.coerce.number().int().min(1).optional(),
  position: z.coerce.number().int().nullable().optional(),
});

const invoiceContainerSchema = z.object({
  inventory_id: z.coerce.number().int().positive(),
  sale_price: moneyish,
  trucking_rate: moneyish,
  modification_price: moneyish,
  invoice_notes: z.string().trim().max(5000).nullable().optional(),
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
  modifications: z.array(invoiceModSchema).max(200).optional(),
});

export const createInvoiceSchema = z.object({
  // The route accepts either key and coalesces client_id ?? contact_id.
  client_id: z.coerce.number().int().positive().optional(),
  contact_id: z.coerce.number().int().positive().optional(),
  invoice_taxed: z.boolean().optional(),
  invoice_credit: z.boolean().optional(),
  containers: z
    .array(
      z.object({
        id: z.coerce.number().int().positive().optional(),
        inventory_id: z.coerce.number().int().positive().optional(),
      }),
    )
    .max(200)
    .optional(),
});

export const updateInvoiceSchema = z.object({
  client_id: z.coerce.number().int().positive().optional(),
  invoice_taxed: z.boolean().optional(),
  invoice_credit: z.boolean().optional(),
  // A timestamptz/ISO string; kept lenient so a value echoed back from the
  // GET (pg timestamp text) isn't rejected. pg parses it on write.
  invoice_date: z.string().max(64).nullable().optional(),
  tax_rate: moneyish,
  cc_fee_rate: moneyish,
  ship_to_same_as_billing: z.boolean().optional(),
  ship_to_name: nullableShortText,
  ship_to_street: nullableShortText,
  ship_to_city: nullableShortText,
  ship_to_state: nullableShortText,
  ship_to_zip: nullableShortText,
  containers: z.array(invoiceContainerSchema).max(200).optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
