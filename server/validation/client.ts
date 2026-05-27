import { z } from 'zod';
import { normalizePhone } from '../lib/phone.js';

// Accepts both the legacy `contact_*` payload shape (still used by the
// 4 pre-PR-1.5 consumers) and the new `client_*` shape from PR 1.5's
// ClientForm. Field length caps relaxed since the new schema uses `text`
// throughout — Zod still validates type + email format at the boundary.

// Optional text fields arrive from forms as `""` rather than absent; coerce
// blanks to null up front so they store as NULL instead of tripping format
// validators (e.g. an empty email no longer 400s).
const blankToNull = z
  .union([z.string(), z.null()])
  .optional()
  .transform((s) => {
    if (s == null) return null;
    const t = s.trim();
    return t === '' ? null : t;
  });

const optionalEmail = blankToNull.refine(
  (v) => v == null || z.string().email().safeParse(v).success,
  { message: 'Invalid email' },
);

export const createClientSchema = z.object({
  customer: z
    .object({
      client_name: z.string().trim().min(1).max(120).optional(),
      contact_name: z.string().trim().min(1).max(120).optional(),
      business_name: blankToNull,
      contact_email: optionalEmail,
      contact_phone: blankToNull.transform((v) => normalizePhone(v)),
      // Legacy single-string address; new code uses split fields below
      contact_address: blankToNull,
      street: blankToNull,
      city: blankToNull,
      state: blankToNull,
      zip: blankToNull,
    })
    .refine((c) => Boolean(c.client_name || c.contact_name), {
      message: 'client_name (or contact_name) is required',
    }),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
