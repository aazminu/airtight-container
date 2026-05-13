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
    // Rate snapshots — pre-filled from client.default_* by the client app
    // and confirmed/overridden by the user during intake. Server doesn't
    // re-derive; we trust what's posted (admin audit covers mistakes).
    in_fee: positiveDecimal,
    out_fee: positiveDecimal,
    daily_rate: positiveDecimal,
    // Optional admin override for intake_date — yard staff usually leaves
    // unset so the DB default of now() applies. Audit screen can override.
    intake_date: z.string().datetime().nullable().optional(),
  }),
});

export type CreateShInventoryInput = z.infer<typeof createShInventorySchema>;

// Audit screen: admin confirms / overrides rates + intake_date and clears
// the pending_audit flag.
export const auditShInventorySchema = z.object({
  in_fee: positiveDecimal.optional(),
  out_fee: positiveDecimal.optional(),
  daily_rate: positiveDecimal.optional(),
  intake_date: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
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
