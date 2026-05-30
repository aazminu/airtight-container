import { z } from 'zod';

// Validation for pickup numbers — outbound analogue of release numbers
// (migration 0022). Pickups bind at outbound time via
// /sh-inventory/outbound, not via pre-loaded enumeration like releases.

export const createPickupSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  number: z.string().trim().min(1).max(80),
  pickup_count: z.coerce.number().int().min(1).max(1000),
});
export type CreatePickupInput = z.infer<typeof createPickupSchema>;

export const createPickupCompanySchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreatePickupCompanyInput = z.infer<typeof createPickupCompanySchema>;

// Batch outbound for S&H boxes. `boxes` is per-row so each box can carry
// its own free-text damage report; pickup_number_id is one for the
// whole batch (matches the current operator workflow — a single pickup
// covers N boxes). Quota enforcement happens server-side under a row
// lock; see sh_inventory.js POST /outbound.
export const shOutboundSchema = z.object({
  pickup_number_id: z.coerce.number().int().positive(),
  outbound_date: z.string().datetime({ offset: true }).or(z.string().min(1)),
  boxes: z
    .array(
      z.object({
        sh_inventory_id: z.coerce.number().int().positive(),
        pickup_damage: z.string().trim().max(500).optional(),
      }),
    )
    .min(1, 'Pick at least one box')
    .max(200, 'Too many at once — split the batch'),
});
export type ShOutboundInput = z.infer<typeof shOutboundSchema>;
