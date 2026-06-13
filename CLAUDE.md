# Airtight Container

Inventory management system for **airtightshippingcontainer.com** — a working container yard in Manalapan, NJ. (Business email + invoicing identity is still `airtightstorage.com` / "Airtight Storage Systems Inc" — site rebrand only.) The repo is mid-2.0 rewrite. The owner (the user) is the only engineer.

---

## Read this first, every session

Before touching anything, read **[docs/HANDOFF.md](docs/HANDOFF.md)**. It is the live session-transition document — current state, work in flight, blockers, next concrete step. It is updated at the end of every working session. **Update it at the end of yours.**

Other docs you may need:
- **[docs/PLAN.md](docs/PLAN.md)** — full 2.0 implementation plan: scope, stack, schema rewrite, domain models, 8-phase PR plan. Source of truth for the rewrite.
- **[docs/V2_TODO.md](docs/V2_TODO.md)** — original spec; PLAN.md supersedes but the prose has context PLAN.md doesn't repeat.
- **[docs/agent_questions.md](docs/agent_questions.md)** — historical Q&A from planning. Skim only if a decision feels under-justified.
- **[docs/session-notes/](docs/session-notes/)** — archived per-session notes from before HANDOFF.md existed. Read-only history.

---

## Stack

**Today (legacy, mid-rewrite):**
- React 18 on CRA — migrating to **Vite + TypeScript**
- Express 4 (ESM, Node 20+) — keeping
- PostgreSQL 16 as system service on EC2 — keeping
- Better Auth (email/password + Google OAuth + admin plugin), migrated 2026-02-24
- Resend for transactional email
- Raw `pg` queries — migrating to **Drizzle ORM + drizzle-kit migrations**
- Docker Compose (FE + BE containers); Postgres stays bare-metal; system nginx terminates SSL
- GitHub Actions → GHCR → SSH `docker compose pull && up -d` on EC2

**Coming in 2.0:**
- AWS S3 (box photos, invoice PDFs, report PDFs)
- AWS Textract (OCR at intake)
- Puppeteer (server-side PDF generation)
- Vitest + Playwright
- react-i18next (Spanish, yard flows only)
- Zod (validation), helmet + sanitize-html (security)

---

## Directory map

- `client/` — frontend. Proxies `/api/*` → `:3001` in dev.
  - `src/routes/` — top-level pages
  - `src/components/{forms,lists,reports,rows,templates}/` — components grouped by role
  - `src/context/userContext.jsx` — global user/popup/theme context
- `server/`
  - `routes/v1/` — legacy routes (`inventory`, `sold`, `release`)
  - `routes/v2/` — newer routes (`invoice`, `dashboard`, `contact`, `release`)
  - `middleware/auth.js` — `checkAuth`, `checkAdmin`, `checkEmployee`
  - `auth.js` — Better Auth config
  - `db/` — pg pool + thin query wrapper
  - `migrate.js` — Better Auth table bootstrap (will be replaced by drizzle-kit in Phase 0)
- `docs/` — planning artifacts + live HANDOFF.md
- `Dockerfile.backend`, `Dockerfile.frontend`, `docker-compose.yml`, `nginx.frontend.conf`
- `.github/workflows/deploy.yml` — CI/CD

---

## Conventions

- **Most work is backend + database.** UI work exists but is secondary except where called out (intake flow, S&H, invoices).
- **Live production system.** No destructive ops without explicit ask. Schema changes go through drizzle-kit migrations and the cutover plan in [PLAN.md §3](docs/PLAN.md#3-schema-20). Always confirm before running anything against prod.
- **Mobile/iPad compliance** is required only for yard-facing flows (intake, yard view, add box). Admin views stay desktop-only.
- **Spanish localization** is required only for yard-facing flows.
- **The existing code is "cursed"** (user's word). Refactor, dedup, and replace as you go. The giant invoice template literal, the broken pagination math — fix them when they're in your path; don't preserve them.
- **No new files unless needed.** Prefer editing.
- **No comments unless they explain non-obvious *why*.** Don't narrate what code does.

---

## Branching

- **`main`** — the trunk. Deploys to EC2 on push (GHA `deploy.yml`). Don't push to `main` unless you mean to ship.
- **Feature branches** (`feat/<slug>`, `fix/<slug>`) — cut off `main`, one per PR, merged back into `main` via the GitHub PR. Delete the branch (local + remote) once merged. Stack a PR on another only when the work genuinely depends on it; otherwise branch from `main`.
- The old long-lived **`2.0`** integration branch was retired 2026-06-13 — the rewrite now ships trunk-based straight through `main`. Historical `phase-N/*` branches are gone too; their work is all in `main`.

## Dev and deploy

- **Local dev:** `./dev.sh` from repo root. Spins backend on `:3001`, client on `:3000`. Requires `server/.env` (copy from `server/.env.example` and fill in `BETTER_AUTH_SECRET`, `DATABASE_URL`, `GOOGLE_CLIENT_*`, `CORS_ORIGIN`, `RESEND`).
- **Local Postgres** is the prod-mirroring DB used during dev. Connection details are in `server/.env`. You can query it via `psql` or by writing a one-off `tsx server/scripts/foo.ts` script and running it.
- **Deploy:** push to `main`. GHA builds both images, pushes to `ghcr.io/harrylynchh/airtight-{backend,frontend}`, SSHes to EC2, restarts the compose stack. Secrets: `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` in GitHub.
- **EC2 `.env`:** lives at `~/airtight-container/.env` on the host. Never committed.

---

## Landmines (things that will bite you)

- **Better Auth must mount at `/api/auth/*` BEFORE `express.json()`** — already wired correctly in `server.js:34-36`. Don't reorder.
- **Old `users` table is still in prod alongside Better Auth `"user"`.** Don't write to it. Phase 1 drops it.
- **Old `releases` table** (v1, `number text[]`) is dead/broken — the v1 INSERT route inserts a scalar into the array column. Phase 1 drops it.
- **`inventory.aquisition_price`** typo is baked into the schema. Stays until Phase 1 rename.
- **The live invoice template** is a giant template literal in [client/src/components/forms/InvoiceForm.jsx](client/src/components/forms/InvoiceForm.jsx) — not the `invoice.html` reference file. Phase 3 replaces it.
- **`inventory.unit_number char(12)`** pads with spaces. Lookups by unit number may silently fail if you don't trim.
- **`sold.outbound_date DEFAULT '2024-01-01'`** — sentinel-as-undelivered. Phase 1 makes it nullable.
- **Phase 4 notes in [user's auto-memory](MEMORY.md)** refer to the *Better Auth migration's* Phase 4, **not** the PLAN.md phases. Different numbering.

---

## Working with the user

- Ask before risky / non-reversible operations (deletions, prod migrations, force pushes, schema changes against prod).
- Don't commit unless asked.
- Don't push or open PRs unless asked.
- If a memory entry or doc disagrees with reality, trust reality and flag the disagreement.
- **At the end of every working session, update [docs/HANDOFF.md](docs/HANDOFF.md)** so the next session starts cold without losing state.
