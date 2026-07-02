# Airtight Container

Inventory, invoicing, and billing platform for a working shipping-container yard in New Jersey. It runs the business: every container the yard buys, stores, sells, or delivers moves through this system, and every dollar it bills is generated here. I'm the sole engineer and operator. It replaced a spreadsheet workflow in 2024 and has been in daily production use since.

~40k lines of TypeScript/JavaScript · 25 versioned schema migrations · 33 test suites (Vitest + Playwright) · deployed on push via GitHub Actions

## The domain

The yard buys shipping containers, stores them, modifies them, and sells or rents them. That decomposes into a handful of interlocking workflows:

**Intake.** New containers are photographed on a tablet in the yard; AWS Textract OCRs the unit markings and pre-fills the ISO unit number (`LLLL ######-#`), size, and type, which staff confirm and enrich with condition, damage notes, and acquisition cost. OCR output is pinned by regression tests against captured Textract fixtures, so parser changes can't silently break intake.

**Inventory.** Containers move one-way through `available > hold > sold > outbound`, with photos on S3 and per-unit P&L derived from acquisition cost against eventual sale and billing revenue.

**Quotes to invoices.** Quotes get sequential business-facing numbers (`QYYYYMM###`) and promote into sales through a stepper that collects delivery details and previews the final invoice before committing. Invoices carry line items plus a separate _modifications_ layer (damage deductions, freight, premiums, with quantities and negative prices), autosave as drafts on every edit, and are validated with Zod on every write path before anything touches the database.

**Storage & handling.** Stored containers are billed monthly, flat-rate, or daily in/out depending on configuration. A `node-cron` month-end job computes what each enrolled container owes and generates the invoices, tied to release events for auditability.

**Outbound.** Releasing a container captures driver and pickup details, writes condition back to inventory, and produces a delivery report PDF keyed to the customer-facing document number rather than internal IDs.

**Dashboard.** Spend, average acquisition price, per-container P&L, and S&H revenue, aggregated in PostgreSQL with CTEs and window functions and charted with Recharts.

Yard-facing flows (intake, yard view, outbound) are tablet-first and localized in Spanish via react-i18next; admin surfaces are desktop-only English.

## Architecture

React 18 + Vite + TypeScript SPA, an Express 4 (ESM, Node 20) API, and PostgreSQL 16, all on a single EC2 host. The frontend is a static Vite build served by nginx in one container; the API runs in another; Postgres runs on the host; system nginx terminates TLS and proxies into the Compose stack.

- **Schema:** Drizzle ORM with numbered SQL migrations (0000-0024).
- **Auth:** Better Auth (email/password + Google OAuth) with three roles (pending, employee, admin) enforced by route middleware.
- **Validation:** Zod schemas on every mutating route; parameterized queries throughout via `pg`.
- **PDFs:** invoices, quotes, and delivery reports render server-side with Puppeteer against Vite-compiled HTML templates, then land on S3 behind pre-signed URLs.
- **Observability:** structured JSON logging with pino/pino-http, request-ID correlation, and a centralized error boundary.
- **Email/SMS:** transactional email via Resend; Twilio wired for driver SMS notifications.

## Engineering highlights

**Zero-touch deploys with transactional migrations.** Push to `main` and GitHub Actions builds both images, pushes to GHCR, and restarts the stack on EC2 over SSH. Before traffic cuts over, a migration runner executes on the new image inside a single transaction: `pg_dump` backup, apply pending migrations, run a validation script against the migrated schema, then commit (or roll back and abort the deploy). Applied versions are tracked in a `schema_migrations` table. There is no manual `psql` against production.

**Stabilizing the PDF service.** Puppeteer originally launched a browser per render and the backend container OOM-crashed under load. The fix was consolidating to a single pooled, recycled browser instance with explicit container memory limits. The render workload was then re-validated inside the hardened container constraints (dropped capabilities, pid limits, non-root) to confirm Chromium still renders correctly under them.

**Multi-page document pagination.** Long invoices and quotes paginate with correct `Page X of N` footers and no content bleeding into the footer region, which sounds trivial and is not, given the interaction between `@media print`, Puppeteer's margin model, and dynamic line-item heights. The pagination math lives in one module (`server/lib/pdf-print.ts`) shared by all document types.

**OCR you can refactor against.** The Textract parsing layer has captured real-world fixtures checked into the repo and a regression suite that locks its behavior, so improving the parser for one container's paint job can't quietly regress another's.

**Month-end billing as a correctness problem.** The S&H billing job has to be idempotent and auditable. It derives charges from release events and billing-mode configuration rather than mutating running totals, so a re-run or a mid-month mode change produces explainable invoices instead of drift.

## Testing

Vitest on both sides of the stack: validation-schema suites for every domain entity, unit tests for the business-logic layer (billing, quote promotion, phone/SMS normalization, OCR parsing, invoice operations), and Textract regression fixtures. Playwright covers the critical end-to-end paths. Server suite is ~226 tests; client adds ~50. `tsc --noEmit` and the full suite gate every change.

## Development

```bash
cp server/.env.example server/.env   # fill in secrets
./dev.sh                             # API on :3001, client on :3000 (Vite proxy)
```

Deploys are push-to-`main`. See `.github/workflows/deploy.yml`.

## Repository layout

```
client/               React SPA (routes, components by role, i18n)
server/
  routes/v2/          domain API (inventory, invoice, quote, release, sh_*, ...)
  lib/                business logic (pdf, textract, billing, sms, phone, logger)
  validation/         Zod schemas per entity
  db/migrations/      numbered SQL migrations (0000-0024)
  tests/              Vitest suites + Textract fixtures
  scripts/            migration runner, smoke tests, one-off data operations
Dockerfile.*          backend / frontend images
docker-compose.yml    two-container production stack
```

---

_The yard's operational data (clients, pricing, financials) lives in the production database, not this repo. Test fixtures use synthetic or public data._
