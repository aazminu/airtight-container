import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  numeric,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

// Source of truth for the 2.0 database shape. Reflects the END state after
// Phase 1's two migrations (additive in PR 1.2, cutover in PR 1.6) and the
// backfill in PR 1.3. Until both migrations have run on a given database,
// this file describes a state the DB has not yet reached — drizzle-kit's
// auto-diff against a not-yet-cut-over DB will be misleading; we hand-write
// the Phase 1 migration SQL.
//
// Better Auth owns its own tables (user / session / account / verification).
// Only `user` is declared here, as a thin FK target for `reports.generated_by`.

// ---- enums ------------------------------------------------------------

export const inventoryState = pgEnum('inventory_state', [
  'pending',
  'available',
  'hold',
  'sold',
  'outbound',
]);

export const shState = pgEnum('sh_state', [
  'pending',
  'in_storage',
  'checked_out',
]);

export const shInvoiceStatus = pgEnum('sh_invoice_status', [
  'pending_review',
  'sent',
  'paid',
]);

// Sales-invoice lifecycle status. See migration 0015.
export const invoiceStatus = pgEnum('invoice_status', [
  'draft',
  'awaiting',
  'paid',
  'delinquent',
  'cancelled',
]);

export const shLineType = pgEnum('sh_line_type', [
  'in_fee',
  'out_fee',
  'storage_days',
]);

// ---- Better Auth reference (managed externally) -----------------------

export const user = pgTable('user', {
  id: text('id').primaryKey(),
});

// ---- sales domain -----------------------------------------------------

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  client_name: text('client_name').notNull(),
  business_name: text('business_name'),
  contact_email: text('contact_email'),
  contact_phone: text('contact_phone'),
  street: text('street'),
  city: text('city'),
  state: text('state'),
  zip: text('zip'),
  default_in_fee: numeric('default_in_fee').notNull().default('65'),
  default_out_fee: numeric('default_out_fee').notNull().default('65'),
  default_daily_rate: numeric('default_daily_rate').notNull().default('1'),
});

export const sale_companies = pgTable('sale_companies', {
  sale_company_id: serial('sale_company_id').primaryKey(),
  sale_company_name: text('sale_company_name').notNull().unique(),
});

export const release_numbers = pgTable('release_numbers', {
  release_number_id: serial('release_number_id').primaryKey(),
  release_number_value: text('release_number_value').notNull().unique(),
  release_number_count: integer('release_number_count').notNull().default(1),
  sale_company_id: integer('sale_company_id')
    .notNull()
    .references(() => sale_companies.sale_company_id, { onDelete: 'cascade' }),
  is_complete: boolean('is_complete').notNull().default(false),
  completed_at: timestamp('completed_at', { withTimezone: true }),
});

export const release_number_containers = pgTable(
  'release_number_containers',
  {
    release_number_id: integer('release_number_id')
      .notNull()
      .references(() => release_numbers.release_number_id, {
        onDelete: 'cascade',
      }),
    container_number: text('container_number').notNull(),
    is_used: boolean('is_used').notNull().default(false),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.release_number_id, table.container_number],
    }),
  }),
);

export const inventory = pgTable(
  'inventory',
  {
    id: serial('id').primaryKey(),
    date: timestamp('date', { withTimezone: true }).notNull().defaultNow(),
    unit_number: text('unit_number').notNull(),
    size: text('size').notNull(),
    damage: text('damage').notNull(),
    trucking_company: text('trucking_company'),
    release_number_id: integer('release_number_id')
      .notNull()
      .references(() => release_numbers.release_number_id),
    sale_company_id: integer('sale_company_id')
      .notNull()
      .references(() => sale_companies.sale_company_id),
    notes: text('notes'),
    acquisition_price: numeric('acquisition_price'),
    state: inventoryState('state').notNull().default('available'),
    is_pending_audit: boolean('is_pending_audit').notNull().default(true),
    photos: text('photos').array(),
  },
  (table) => ({
    stateIdx: index('inventory_state_idx').on(table.state),
    pendingAuditIdx: index('inventory_pending_audit_idx').on(
      table.is_pending_audit,
    ),
  }),
);

export const sold = pgTable('sold', {
  id: serial('id').primaryKey(),
  inventory_id: integer('inventory_id')
    .notNull()
    .unique()
    .references(() => inventory.id, { onDelete: 'cascade' }),
  sold_date: timestamp('sold_date', { withTimezone: true }).defaultNow(),
  outbound_trucker: text('outbound_trucker'),
  destination: text('destination'),
  sale_price: numeric('sale_price'),
  release_number: text('release_number'),
  trucking_rate: numeric('trucking_rate'),
  modification_price: numeric('modification_price'),
  material_cost: numeric('material_cost'),
  labor_cost: numeric('labor_cost'),
  invoice_notes: text('invoice_notes'),
  outbound_date: timestamp('outbound_date', { withTimezone: true }),
});

// Per-modification line items, ordered by `position`. Each row
// becomes one sub-row beneath its container's primary line in the
// invoice template. Legacy `sold.modification_price` stays as a
// fallback for invoices that pre-date Phase 3 PR 3.4 — never
// backfilled, per owner.
export const sold_modifications = pgTable(
  'sold_modifications',
  {
    id: serial('id').primaryKey(),
    sold_id: integer('sold_id')
      .notNull()
      .references(() => sold.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    price: numeric('price').notNull(),
    position: integer('position').notNull().default(0),
  },
  (table) => ({
    soldIdx: index('sold_modifications_sold_idx').on(table.sold_id),
  }),
);

export const invoices = pgTable(
  'invoices',
  {
    invoice_id: serial('invoice_id').primaryKey(),
    invoice_number: integer('invoice_number').notNull().unique(),
    invoice_taxed: boolean('invoice_taxed').notNull().default(false),
    client_id: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    invoice_date: timestamp('invoice_date', { withTimezone: true })
      .notNull()
      .defaultNow(),
    invoice_credit: boolean('invoice_credit').default(false),
    subtotal: numeric('subtotal'),
    tax_rate: numeric('tax_rate'),
    tax_amount: numeric('tax_amount'),
    cc_fee_rate: numeric('cc_fee_rate'),
    cc_fee_amount: numeric('cc_fee_amount'),
    total: numeric('total'),
    pdf_s3_key: text('pdf_s3_key'),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    // Lifecycle status (PR 10.1). Default 'draft' on creation; flips
    // to 'awaiting' when the invoice is emailed. Operator clicks
    // drive the rest (awaiting → paid / delinquent / cancelled).
    status: invoiceStatus('status').notNull().default('draft'),
    status_changed_at: timestamp('status_changed_at', { withTimezone: true }),
    status_changed_by_user_id: text('status_changed_by_user_id'),
  },
  (table) => ({
    invoiceDateIdx: index('invoices_invoice_date_idx').on(table.invoice_date),
    statusIdx: index('invoices_status_idx').on(table.status),
  }),
);

export const invoice_containers = pgTable(
  'invoice_containers',
  {
    invoice_id: integer('invoice_id')
      .notNull()
      .references(() => invoices.invoice_id, { onDelete: 'cascade' }),
    container_id: integer('container_id')
      .notNull()
      .unique()
      .references(() => inventory.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.invoice_id, table.container_id] }),
  }),
);

// ---- storage & handling domain ---------------------------------------

export const sh_inventory = pgTable(
  'sh_inventory',
  {
    id: serial('id').primaryKey(),
    client_id: integer('client_id')
      .notNull()
      .references(() => clients.id),
    unit_number: text('unit_number').notNull(),
    size: text('size').notNull(),
    damage: text('damage'),
    intake_date: timestamp('intake_date', { withTimezone: true })
      .notNull()
      .defaultNow(),
    in_fee: numeric('in_fee').notNull(),
    out_fee: numeric('out_fee').notNull(),
    daily_rate: numeric('daily_rate').notNull(),
    state: shState('state').notNull().default('pending'),
    is_pending_audit: boolean('is_pending_audit').notNull().default(true),
    checkout_date: timestamp('checkout_date', { withTimezone: true }),
    notes: text('notes'),
    photos: text('photos').array(),
  },
  (table) => ({
    stateIdx: index('sh_inventory_state_idx').on(table.state),
    pendingAuditIdx: index('sh_inventory_pending_audit_idx').on(
      table.is_pending_audit,
    ),
    clientIdx: index('sh_inventory_client_idx').on(table.client_id),
  }),
);

export const sh_invoices = pgTable(
  'sh_invoices',
  {
    id: serial('id').primaryKey(),
    client_id: integer('client_id')
      .notNull()
      .references(() => clients.id),
    billing_month: date('billing_month').notNull(),
    invoice_number: integer('invoice_number').notNull().unique(),
    subtotal: numeric('subtotal'),
    tax_rate: numeric('tax_rate'),
    tax_amount: numeric('tax_amount'),
    total: numeric('total'),
    pdf_s3_key: text('pdf_s3_key'),
    status: shInvoiceStatus('status').notNull().default('pending_review'),
    generated_at: timestamp('generated_at', { withTimezone: true }),
    sent_at: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => ({
    clientMonthUniq: uniqueIndex('sh_invoices_client_month_uniq').on(
      table.client_id,
      table.billing_month,
    ),
  }),
);

export const sh_invoice_lines = pgTable('sh_invoice_lines', {
  id: serial('id').primaryKey(),
  sh_invoice_id: integer('sh_invoice_id')
    .notNull()
    .references(() => sh_invoices.id, { onDelete: 'cascade' }),
  sh_box_id: integer('sh_box_id')
    .notNull()
    .references(() => sh_inventory.id),
  line_type: shLineType('line_type').notNull(),
  days_count: integer('days_count'),
  rate: numeric('rate'),
  amount: numeric('amount'),
  description: text('description'),
});

// ---- reports ---------------------------------------------------------

export const reports = pgTable(
  'reports',
  {
    id: serial('id').primaryKey(),
    report_type: text('report_type').notNull(),
    generated_by: text('generated_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    generated_at: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    parameters: jsonb('parameters'),
    // Snapshot of the data the template was rendered against. Frozen at
    // create time so re-renders and historical views don't drift when
    // the underlying sold/invoices rows change.
    resolved_data: jsonb('resolved_data'),
    pdf_s3_key: text('pdf_s3_key'),
    pdf_generated_at: timestamp('pdf_generated_at', { withTimezone: true }),
    // ATYYYYMM### identifier for delivery_sheet reports (NULL otherwise).
    // Sequenced in server/lib/delivery-sheet-number.ts. See migration 0016.
    delivery_sheet_number: text('delivery_sheet_number'),
    emailed_to: text('emailed_to').array(),
    emailed_at: timestamp('emailed_at', { withTimezone: true }),
    sms_sent_at: timestamp('sms_sent_at', { withTimezone: true }),
    // A2P 10DLC consent audit. Populated by the SMS send route on the
    // same write that fires the Twilio dispatch — see migration 0014.
    sms_consent_at: timestamp('sms_consent_at', { withTimezone: true }),
    sms_consent_by_user_id: text('sms_consent_by_user_id'),
    sms_consent_text_version: text('sms_consent_text_version'),
  },
  (table) => ({
    typeIdx: index('reports_type_idx').on(table.report_type),
    generatedAtIdx: index('reports_generated_at_idx').on(table.generated_at),
  }),
);

// Public receipt-link tokens for delivery sheets. One row per "Send
// to driver" SMS or email; the token in the URL is the access
// credential, the row is its server-side bookkeeping. See migration
// 0011 and the public /r/:token route.
export const report_receipt_links = pgTable(
  'report_receipt_links',
  {
    id: serial('id').primaryKey(),
    token: text('token').notNull().unique(),
    report_id: integer('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    accessed_at: timestamp('accessed_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    tokenIdx: index('report_receipt_links_token_idx').on(table.token),
    reportIdIdx: index('report_receipt_links_report_id_idx').on(table.report_id),
  }),
);

// Admin-editable modification description presets. Surfaced in the
// invoice editor's <datalist> so the description input still accepts
// free text but suggests the common billing items first. Replaces the
// hard-coded array in client/src/components/forms/modificationPresets.ts.
export const mod_presets = pgTable(
  'mod_presets',
  {
    id: serial('id').primaryKey(),
    label: text('label').notNull().unique(),
    position: integer('position').notNull().default(0),
    default_price: numeric('default_price'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    positionIdx: index('mod_presets_position_idx').on(table.position),
  }),
);

// Admin-editable container-size presets. Intake + InventoryEditor render
// these as a <datalist> behind the size input. Label-only; no FK from
// `inventory.size` / `sh_inventory.size` so a deleted preset doesn't
// strand historical rows.
export const size_presets = pgTable(
  'size_presets',
  {
    id: serial('id').primaryKey(),
    label: text('label').notNull().unique(),
    position: integer('position').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    positionIdx: index('size_presets_position_idx').on(table.position),
  }),
);

// Admin-editable container-damage presets. Same pattern as size_presets.
export const damage_presets = pgTable(
  'damage_presets',
  {
    id: serial('id').primaryKey(),
    label: text('label').notNull().unique(),
    position: integer('position').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    positionIdx: index('damage_presets_position_idx').on(table.position),
  }),
);
