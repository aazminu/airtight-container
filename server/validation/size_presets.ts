import { z } from 'zod';

// Validation for the size-preset admin CRUD (Phase 9 PR 9.1). `label` is
// what appears in the intake / InventoryEditor <datalist>; must be unique.
// `position` controls render order; lower numbers first.

export const sizePresetSchema = z.object({
  label: z.string().trim().min(1).max(120),
  position: z.number().int().min(0).max(9999).default(0),
});

export const sizePresetUpdateSchema = sizePresetSchema.partial();

export type SizePresetInput = z.infer<typeof sizePresetSchema>;
export type SizePresetUpdateInput = z.infer<typeof sizePresetUpdateSchema>;
