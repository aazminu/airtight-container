import { z } from 'zod';

// Validation for the modification-preset admin CRUD (Phase 5 PR 5.1).
// `label` is what appears in the invoice editor's <datalist>; must be
// unique. `position` controls render order; lower numbers first.

export const modPresetSchema = z.object({
  label: z.string().trim().min(1).max(120),
  position: z.number().int().min(0).max(9999).default(0),
});

export const modPresetUpdateSchema = modPresetSchema.partial();

export type ModPresetInput = z.infer<typeof modPresetSchema>;
export type ModPresetUpdateInput = z.infer<typeof modPresetUpdateSchema>;
