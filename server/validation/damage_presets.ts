import { z } from 'zod';

// Validation for the damage-preset admin CRUD (Phase 9 PR 9.1). Same
// shape as size_presets.

export const damagePresetSchema = z.object({
  label: z.string().trim().min(1).max(120),
  position: z.number().int().min(0).max(9999).default(0),
});

export const damagePresetUpdateSchema = damagePresetSchema.partial();

export type DamagePresetInput = z.infer<typeof damagePresetSchema>;
export type DamagePresetUpdateInput = z.infer<typeof damagePresetUpdateSchema>;
