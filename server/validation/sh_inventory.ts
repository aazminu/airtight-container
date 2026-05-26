import { z } from 'zod';

// Schemas for /api/v2/sh-inventory. Lifecycle states match the sh_state
// enum in server/db/schema.ts and PLAN §4.2:
//   pending → in_storage → checked_out
// State transitions are validated server-side (see routes/v2/sh_inventory.js).

export const shStateEnum = z.enum(['pending', 'in_storage', 'checked_out']);
export type ShState = z.infer<typeof shStateEnum>;

const positiveDecimal = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'string' ? v.trim() : String(v)))
  .refine((s) => /^\d+(\.\d{1,2})?$/.test(s) && Number(s) >= 0, {
    message: 'Must be a non-negative number with up to 2 decimals',
  });

export const createShInventorySchema = z.object({
  box: z.object({
    client_id: z.number().int().positive(),
    unit_number: z.string().trim().min(1).max(40),
    size: z.string().trim().min(1).max(40),
    damage: z.string().max(255).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    // PR 2.8.1: yard staff no longer touches rates during intake — admin
    // confirms / overrides on the audit screen. Server pre-fills from
    // clients.default_* on insert when these are omitted.
    in_fee: positiveDecimal.optional(),
    out_fee: positiveDecimal.optional(),
    daily_rate: positiveDecimal.optional(),
    // Optional admin override for intake_date — yard staff usually leaves
    // unset so the DB default of now() applies. Audit screen can override.
    intake_date: z.string().datetime().nullable().optional(),
    // Optional list of S3 keys (PR 2.6). First key is the OCR target by
    // convention; the rest are documentation. Bounded at 20 to keep the
    // audit screen's thumbnail strip sane and limit S3 spend per box.
    photos: z.array(z.string()).max(20).optional(),
  }),
});

export type CreateShInventoryInput = z.infer<typeof createShInventorySchema>;

// Audit screen: admin confirms / overrides rates + intake_date + every
// intake field. Anything omitted is left untouched (COALESCE in the
// UPDATE statement).
export const auditShInventorySchema = z.object({
  in_fee: positiveDecimal.optional(),
  out_fee: positiveDecimal.optional(),
  daily_rate: positiveDecimal.optional(),
  intake_date: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  unit_number: z.string().trim().min(1).max(40).optional(),
  size: z.string().trim().min(1).max(40).optional(),
  damage: z.string().trim().max(255).nullable().optional(),
});

export type AuditShInventoryInput = z.infer<typeof auditShInventorySchema>;

// Check-out flow body. checkout_date is required (the yard's actual
// outbound timestamp); fees/rate are read from the existing row.
export const checkoutShInventorySchema = z.object({
  checkout_date: z.string().datetime(),
});

export type CheckoutShInventoryInput = z.infer<typeof checkoutShInventorySchema>;

// Whitelist of legal state transitions. Returns the allowed next states
// for a given current state. Used by the PUT /state/:id route.
export function allowedNextStates(current: ShState): ShState[] {
  switch (current) {
    case 'pending':
      return ['in_storage'];
    case 'in_storage':
      return ['checked_out'];
    case 'checked_out':
      return [];
  }
}
