import { z } from 'zod';

// Validation for the PR 2.8 release-container enumeration endpoints.
// Admin can pre-load specific container numbers per release; intake
// auto-associates by unit_number on submit.

export const addContainersSchema = z.object({
  numbers: z
    .array(z.string().trim().min(1).max(40))
    .min(1, 'Provide at least one container number')
    .max(100, 'Too many at once — split the request'),
});

export type AddContainersInput = z.infer<typeof addContainersSchema>;
