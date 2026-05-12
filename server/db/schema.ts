import {
  pgTable,
  serial,
  varchar,
  char,
  timestamp,
  numeric,
} from 'drizzle-orm/pg-core';

// This file mirrors the *current* prod schema (see docs/schema.psql).
// Phase 1 of the 2.0 rewrite replaces this with the redesigned schema:
// `aquisition_price` typo fix, `state` Postgres enum, FK additions on
// sale_company / release_number, etc. (see docs/PLAN.md §3).
//
// Add tables here only as routes that use them are ported to Drizzle.
// The full backfill happens during the Phase 1 cutover, not piecemeal here.

export const inventory = pgTable('inventory', {
  id: serial('id').primaryKey(),
  date: timestamp('date', { withTimezone: true }).notNull().defaultNow(),
  unit_number: char('unit_number', { length: 12 }).notNull(),
  size: char('size', { length: 5 }).notNull(),
  damage: varchar('damage', { length: 60 }).notNull(),
  trucking_company: varchar('trucking_company', { length: 40 }),
  acceptance_number: varchar('acceptance_number', { length: 15 }),
  sale_company: varchar('sale_company', { length: 20 }),
  notes: varchar('notes', { length: 255 }),
  aquisition_price: numeric('aquisition_price'),
  state: varchar('state', { length: 10 }).notNull().default('available'),
});
