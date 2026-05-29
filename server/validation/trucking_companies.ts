import { z } from 'zod';

const blankToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;

export const truckingCompanySchema = z.object({
  company_name: z.string().trim().min(1, 'Company name is required').max(120),
  dispatch_name: z.preprocess(blankToNull, z.string().trim().max(120).nullable().optional()),
  dispatch_phone: z.preprocess(blankToNull, z.string().trim().max(40).nullable().optional()),
  dispatch_email: z.preprocess(
    blankToNull,
    z.string().trim().email().max(160).nullable().optional(),
  ),
});

export type TruckingCompanyInput = z.infer<typeof truckingCompanySchema>;
