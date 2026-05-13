import { z } from 'zod';

// Validation for the Sales (inventory) audit flow. The admin reviews a
// pending-audit box and confirms or adjusts:
//   - acquisition_price (Sales-only — S&H has its own rate audit schema)
//   - intake date (inventory.date column — yard staff doesn't override at
//     intake; admin can backdate here if the box arrived earlier)
//   - notes
// Submitting clears is_pending_audit and transitions state pending →
// available. The route enforces the transition; this file only validates
// the payload shape.

const positiveDecimal = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'string' ? v.trim() : String(v)))
  .refine((s) => /^\d+(\.\d{1,2})?$/.test(s) && Number(s) >= 0, {
    message: 'Must be a non-negative number with up to 2 decimals',
  });

export const auditInventorySchema = z.object({
  acquisition_price: positiveDecimal.nullable().optional(),
  date: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type AuditInventoryInput = z.infer<typeof auditInventorySchema>;
