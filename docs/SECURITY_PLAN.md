# Security Plan

Living document for the security backlog after the 2026-05-25 audit + PR #9 deploy. PR #9 covered the five CRIT findings and four HIGH findings; this file tracks everything still deferred.

---

## Status snapshot

- **PR #9 — merged + deployed** (`e04aa9c` then hotfix `8b02fc7` via PR #10). Covered: open email relay, stored XSS in invoice email, role-assignment escalation, SSH host-key TOFU, CORS allowlist boot guard, dropped root in containers, nginx security headers + dotfile/sourcemap deny, BCC moved to env var, deleted dead `Invoice.jsx` + `docs/schema.psql`, `npm audit fix` (server: 12 → 10 vulns; high cleared).
- **PR #10** (`8b02fc7`) — merged + deployed. deploy.yml hotfix for the SSH known_hosts hostname mismatch.
- **PRs #11 / #12** — not yet started. Scope below.
- **Audit transcripts** — the full ranked findings from the 2026-05-25 sweep aren't archived in this repo; recover from the session log if needed. The items below are paraphrased + grouped.

---

## PR #11 — security follow-up (high-priority deferred items)

### Rate limits on costly outbound channels
Toll-fraud / harassment potential. Twilio bills per SMS, Resend bills per email; an authenticated employee with a bad day or a stolen session can pump messages.

- `server/routes/v2/report.js` `POST /:id/sms` — add per-IP and per-report rate limit (suggest: 5 SMS / 15 min / IP).
- `server/routes/v2/report.js` `POST /:id/email` — limit (suggest: 20 / 15 min / IP).
- `server/routes/v2/invoice.js` `POST /:id/email` — limit (suggest: 20 / 15 min / IP).
- `server/routes/v2/sh_invoice.js` send endpoint — same.

Use `express-rate-limit` per-route, NOT mounted globally (different limits per channel).

### Mass-assignment / Zod schema coverage
Several POST/PUT routes consume `req.body` directly. Extra fields silently rewrite ownership; type-confusion lets `NaN`/`null` slip into numeric columns.

Add `validateBody(schema)` middleware to:
- `server/routes/v2/invoice.js` POST, PUT
- `server/routes/v1/inventory.js` POST `/add`, PUT `/:id`, PUT `/notes/:id`, PUT `/state/:id`
- `server/routes/v1/sold.js` POST, PUT `/invoice/:id`, PUT `/deliverysheet/:id`, PUT `/notes/:id`
- `server/routes/v2/release.js` POST, POST `/company`
- `server/routes/v2/client.js` PUT `/:id`

Schemas mostly already exist in `server/validation/`; just wire them through.

### Error message hygiene
~20 sites do `res.status(500).json({ message: err.message || "Internal server error" })`. `err.message` from pg / Drizzle leaks SQL constraint names + column names; Twilio errors include phone numbers; Resend errors include API-side detail.

- Centralize in a helper (e.g. `server/middleware/errorBoundary.js`): `console.error(err); res.status(500).json({ message: "Internal server error" })`.
- Apply across `routes/v2/report.js`, `routes/v2/invoice.js`, `routes/v2/sh_invoice.js`, `routes/v2/pnl.js`, etc.

### Better Auth hardening
`server/auth.js` is permissive:

- Require `BETTER_AUTH_SECRET` at boot (fail-fast if unset).
- Configure `advanced.defaultCookieAttributes` = `{ httpOnly: true, secure: true, sameSite: 'lax' }`.
- Restrict Google sign-up by `hd` (hosted-domain) param, or post-validate `account.email` against an operator allowlist.
- Disable / gate the `admin` plugin's `impersonate-user` endpoint (`impersonationSessionDuration: 0` or remove from plugin options).

### Auth-limiter granularity
`authLimiter` (20 / 15 min) covers signin + signup + password-reset in one bucket. Split into per-action buckets so credential stuffing on `/signin` doesn't share quota with legitimate signup traffic.

---

## PR #12 — medium polish + supply-chain

### Container + compose hardening
- Bind backend `3001:3001` and frontend `8080:8080` to `127.0.0.1` (ufw blocks them today but defense-in-depth).
- Add `read_only: true`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `mem_limit`, `pids_limit` to both services.
- Add healthchecks.
- Drop `host.docker.internal:host-gateway` if possible (containers reaching the EC2 host's full network); otherwise document why it's needed.
- Add log rotation: `logging: { driver: json-file, options: { max-size: "10m", max-file: "5" }}`.

### Supply chain
- Pin all Docker base images to SHA digests (`node:20-alpine@sha256:...`, `nginxinc/nginx-unprivileged:alpine@sha256:...`).
- Pin all third-party GHA actions to commit SHAs with comments (e.g. `actions/checkout@b4ffde65...  # v4.2.2`).
- Add Trivy or Grype scan step before image push; fail on HIGH/CRITICAL.
- Add cosign image signing.
- Enable Dependabot for the `.github/workflows/` ecosystem.

### Data minimization
- `GET /api/v2/report` list endpoint projects `resolved_data` jsonb (full PDF source incl. driver phone, internal IDs). Project only display fields on list; reserve `resolved_data` for `/:id`.
- `GET /api/v1/inventory` returns `acquisition_price` (internal cost) to every employee. Split into admin-only column or hide for non-admin roles.

### Public endpoint hardening
- `server/routes/public/receipt.js` — uniform 404 for all failure modes (not-found / revoked / expired / wrong-type) to close the token-existence oracle.
- `POST /:id/sms` success response echoes the receipt `token` — strip from response body (token is a 30-day public bearer).
- `503 SMS not configured` response names exact env vars — replace with a generic message.

### Presigned-PUT restrictions
- `server/routes/v2/intake.js` `/photo/presign` — restrict content-type to `image/jpeg|png|heic|webp` only. SVG with embedded `<script>` is stored XSS on later inline render.
- Add max-size (e.g. 10 MB) via `Content-Length` range in presigned URL.
- Set `Content-Disposition: attachment` on presignedGet so browsers can't render inline.

### Dependency cleanup
- `npm audit fix --force` in `server/` upgrades `node-cron` 3 → 4 (breaking — check the cron-schedule syntax + the `OUTBOUND_FLIP_CRON` / `SH_MONTH_END_CRON` env-var off-switches).
- Vite 5 → 8 in `client/` clears the `esbuild` dev-server SSRF advisory (dev-only, low real risk for prod).
- Split into its own PR — has the most regression surface area.

---

## Lower priority / nice-to-have

- `s3.ts` photo-presigned GET TTL: 3600s → 600s.
- `routes/v2/client.js` DELETE hard-deletes a client row. Convert to soft-delete to preserve invoice-join history.
- nginx `limit_req_zone` on `/api/` to absorb scrape/burst traffic.
- Restrict SSH `22/tcp` from "Anywhere" to operator-known IPs (one-line `ufw allow from <ip>` per location).
- Backup hygiene: cron-scheduled `pg_dump`, encrypt with `age`, push to S3 with versioning + object-lock. Currently manual.
- HSTS preload submission + CAA DNS records.

---

## Needs human review (not visible from this repo)

- **EC2 SG ingress** — is anything beyond 22/80/443 open to `0.0.0.0/0`? `ufw` is locked down (confirmed 2026-05-26) but AWS SG sits in front. Don't want them to disagree.
- **Postgres `pg_hba.conf` / `postgresql.conf`** — is `listen_addresses` bound to `127.0.0.1` only? Is `sslmode=require` enforced on Drizzle's connection string?
- **GHA deploy user identity** — is `secrets.EC2_USER` a least-privilege deploy account whose only privilege is `docker compose` in `/home/ubuntu/airtight-container`, or `ubuntu` with sudo NOPASSWD? Determines blast radius if the SSH key ever leaks.
- **Backup encryption** + offsite storage.

---

## Intentional non-issues (documented for future agents)

- **Pervasive IDOR** in v1 + v2 routes (any authenticated employee can read/edit any client/invoice/inventory). Acceptable per single-tenant design — there is one yard, all employees see all data. If multi-tenancy is ever added, every `:id` handler needs a tenant filter.
- **Google Fonts on every page load.** Privacy policy doesn't list Google as a sub-processor for font loading. Low impact; disclose if you add a privacy-policy refresh.
- **`/r/:token` route** — 30-day token TTL, distinct error strings on failure modes. Tightened by PR #12 above; current state is acceptable for B2B driver receipts.
