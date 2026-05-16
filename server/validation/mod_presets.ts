import { z } from 'zod';

// Validation for the modification-preset admin CRUD (Phase 5 PR 5.1).
// `label` is what appears in the invoice editor's <datalist>; must be
// unique. `position` controls render order; lower numbers first.

// `default_price` is optional and may be cleared via `null`. Stored as
// `numeric` (string at the pg boundary); we accept JS numbers and let
// drizzle/pg do the cast. Negative prices rejected; very large bounded
// to keep the input sane.
export const modPresetSchema = z.object({
  label: z.string().trim().min(1).max(120),
  position: z.number().int().min(0).max(9999).default(0),
  default_price: z.number().nonnegative().max(1_000_000).nullable().optional(),
});

export const modPresetUpdateSchema = modPresetSchema.partial();

export type ModPresetInput = z.infer<typeof modPresetSchema>;
export type ModPresetUpdateInput = z.infer<typeof modPresetUpdateSchema>;
