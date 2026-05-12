import { z } from 'zod';

// Accepts both the legacy `contact_*` payload shape (still used by the
// 4 pre-PR-1.5 consumers) and the new `client_*` shape from PR 1.5's
// ClientForm. Field length caps relaxed since the new schema uses `text`
// throughout — Zod still validates type + email format at the boundary.

export const createClientSchema = z.object({
  customer: z
    .object({
      client_name: z.string().trim().min(1).max(120).optional(),
      contact_name: z.string().trim().min(1).max(120).optional(),
      business_name: z.string().trim().max(120).nullable().optional(),
      contact_email: z.string().email().max(320).nullable().optional(),
      contact_phone: z.string().max(20).nullable().optional(),
      // Legacy single-string address; new code uses split fields below
      contact_address: z.string().max(255).nullable().optional(),
      street: z.string().max(255).nullable().optional(),
      city: z.string().max(120).nullable().optional(),
      state: z.string().max(40).nullable().optional(),
      zip: z.string().max(20).nullable().optional(),
    })
    .refine((c) => Boolean(c.client_name || c.contact_name), {
      message: 'client_name (or contact_name) is required',
    }),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
