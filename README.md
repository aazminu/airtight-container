# Airtight Container

Inventory management and invoicing system built for a real shipping-container yard in Manalapan, NJ. The business buys, stores, and sells shipping containers. This system tracks every container from arrival through hold, sale, and final delivery and handles all the billing.

Production app used daily by the yard staff. It replaced a spreadsheet workflow, so correctness matters more than novelty.

---

## What it does

**Container tracking.** Every container has a record: unit number (formatted to ISO standard `LLLL ######-#`), size, condition, acquisition cost, damage notes, and status. Status flows one-way: available > hold > sold > outbound. The intake flow uses AWS Textract to OCR a photo of the container's markings and pre-fill the unit number and type.

**Invoicing.** Invoices have line items (price, qty, description) and a separate modifications layer for things like damage deductions, freight charges, or premiums. Modifications have their own quantity field and support negative prices. Invoices autosave as drafts on every edit and survive navigation. The editor is a controlled React form; the backend validates every write with Zod before touching the database.

**Quotes.** Quotes live in their own table with sequential numbering (`QYYYYMM###`) and can be promoted into a real sale through a 4-step stepper that collects delivery info and previews the resulting invoice before committing. They share the same modification system as invoices.

**Storage & Handling billing.** S&H containers have configurable billing modes: monthly, flat-rate, or daily in/out. A `node-cron` job runs at month-end, calculates what each enrolled container owes, and generates invoices automatically. Billing is linked to release events for a clean audit trail.

**Outbound / delivery.** Releasing a container is a 4-step stepper: capture driver details, pickup number, and container condition; write back to inventory; generate a delivery report PDF. The report uses the customer-facing AT number, not the internal DB id (this was caught after the original reports were going out wrong).

**PDF generation.** Invoices, quotes, and delivery reports all render server-side via Puppeteer against Vite-compiled HTML templates. Multi-page layouts paginate correctly with `Page X of N` footers and don't bleed content into the page footer. Getting that right with `@media print` and Puppeteer's margin model took some iteration. PDFs are stored on S3 with pre-signed URLs.

**Business stats.** The dashboard aggregates total spend, average acquisition price, per-container P&L, and S&H revenue using window functions and CTEs on the PostgreSQL side, then charts them with Recharts on the frontend.

---

## How it's built

The stack is React 18 + Vite + TypeScript on the frontend and Express 4 (ESM) on the backend, with PostgreSQL 16 running as a system service on EC2. Auth is Better Auth with email/password and Google OAuth. It mounts at `/api/auth/*` before `express.json()` because the library's request parsing breaks if body parsing runs first. Three roles: pending, employee, admin.

Schema is managed with Drizzle ORM and drizzle-kit migrations as numbered SQL files. The deploy pipeline runs them transactionally on the new Docker image: `pg_dump` backup, apply pending migrations, run a validation script, then commit (or rollback and abort). Applied versions are tracked in a `schema_migrations` table. No manual `psql` in prod.

The Docker Compose stack runs the frontend (nginx serving the Vite build) and backend as separate containers. System nginx on the EC2 host terminates SSL and proxies to the stack. CI/CD is GitHub Actions: build both images, push to GHCR, SSH to EC2, `docker compose pull && up -d`.

Security is Helmet headers, `express-rate-limit` on all API routes, and Zod on every write path. Queries use the `pg` library with parameterized statements throughout. Transactional email goes through Resend. Twilio is wired for driver SMS but waiting on 10DLC carrier approval.

Yard-facing flows (intake, outbound, yard view) are localized in Spanish via react-i18next and built for tablet. Admin views are desktop-only. Tests are Vitest (server + client unit) and Playwright (E2E).

---

## Dev & deploy

`./dev.sh` from repo root. Backend on `:3001`, frontend on `:3000` with a Vite proxy. Requires `server/.env` (see `server/.env.example`).

Push to `main` to deploy. GHA builds both images, pushes to GHCR, SSHes to EC2, and restarts the stack. Migrations run automatically on the new image before traffic cuts over.
