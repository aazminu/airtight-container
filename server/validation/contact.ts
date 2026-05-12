import { z } from 'zod';

// Mirrors current `contacts` column constraints (see docs/schema.psql).
// Phase 1 renames this domain to `clients` with split address fields,
// business_name, and S&H rate defaults — those schemas land then.

export const createContactSchema = z.object({
  customer: z.object({
    contact_name: z.string().trim().min(1).max(25),
    contact_email: z.string().email().max(320).nullable().optional(),
    contact_phone: z.string().max(12).nullable().optional(),
    contact_address: z.string().max(70).nullable().optional(),
  }),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
