# Security Plan

Living document for the security backlog after the 2026-05-25 audit + PR #9 deploy. PR #9 covered the five CRIT findings and four HIGH findings; this file tracks everything still deferred.

---

## Status snapshot

- **PR #9 — merged + deployed** (`e04aa9c` then hotfix `8b02fc7` via PR #10). Covered: open email relay, stored XSS in invoice email, role-assignment escalation, SSH host-key TOFU, CORS allowlist boot guard, dropped root in containers, nginx security headers + dotfile/sourcemap deny, BCC moved to env var, deleted dead `Invoice.jsx` + `docs/schema.psql`, `npm audit fix` (server: 12 → 10 vulns; high cleared).
- **PR #10** (`8b02fc7`) — merged + deployed. deploy.yml hotfix for the SSH known_hosts hostname mismatch.
- **PRs #11 / #12** — superseded by a **2026-06-19 phased security sweep** (review re-validated everything below against current code + found new items). **Phase 1 (logging + error hygiene) shipped** on `feat/logging-foundation`: pino + pino-http structured logging (redaction of auth/cookie/token/secret, per-request correlation ids), centralized `errorBoundary` middleware, error-message hygiene sweep (25 `err.message` 5xx leaks genericized — Twilio operator-facing passthrough deliberately kept), SMS success-response token stripped, Docker json-file log rotation. **Phase 2 (auth hardening) shipped** on `feat/auth-hardening`: Better Auth secret fail-fast + cookie hardening + impersonation block, sign-up/reset rate-limiting, `v2/sold` PATCH raised to `checkAdmin`, and the `v1/sold` `/available/:id` param-ignored bug fixed. **Phase 3 (validation / data-min) shipped** on `feat/input-validation`: SVG-upload XSS blocked, per-route SMS/email rate limits, email-recipient validation, `run-month-end` body validation, `acquisition_price` gated to admins, receipt-link oracle closed + generic SMS-not-configured message. The broad mass-assignment `validateBody` wiring and report-list `resolved_data` minimization are **deliberately deferred** (no existing schemas / client coupling — see sections below). Phase 4 (infra) below — pending.
- **Audit transcripts** — the full ranked findings from the 2026-05-25 sweep aren't archived in this repo; recover from the session log if needed. The items below are paraphrased + grouped.

---

## PR #11 — security follow-up (high-priority deferred items)

### Rate limits on costly outbound channels — ✅ DONE (Phase 3, `feat/input-validation`)
Toll-fraud / harassment potential. Twilio bills per SMS, Resend bills per email.

- ✅ `report.js POST /:id/sms` — `smsLimiter` 20 / 15 min / IP.
- ✅ `report.js POST /:id/email` + ✅ `invoice.js POST /:id/email` — `emailLimiter` 30 / 15 min / IP.
- ⏭️ `sh_invoice.js PUT /:id/send` — **skipped**: it only flips status to 'sent', it doesn't actually send email/SMS, so there's no paid-channel abuse surface.

Per-route via `express-rate-limit`; limits are deliberately generous (cap runaway abuse without blocking a single operator's bursts) — tune if they bite.

### Mass-assignment / Zod schema coverage — ⏳ PARTIAL (Phase 3)
Several POST/PUT routes consume `req.body` directly.

Done in Phase 3:
- ✅ Recipient (`to`) email validation on `invoice.js` + `report.js` email routes (an unvalidated `to` could route the PDF anywhere and, via `update_client_email`, overwrite a client's email of record).
- ✅ `sh_invoice.js POST /run-month-end` body (`year`/`monthIndex`) validated.
- (`release.js POST /:id/containers` already had `addContainersSchema` with `.max(100)`.)

**Deferred (deliberately, not skipped):** wiring `validateBody` onto `invoice` POST/PUT, `v1/inventory` add/edit/notes/state, `v1/sold` POST/PUT, `v2/release` POST + `/company`, `v2/client` PUT `/:id`. Re-checking found these routes have **no existing schema** (contrary to the original note), and several take nested/legacy body shapes (e.g. `client` PUT reads `editedClient`/`editedContact`). Authoring strict schemas blind risks rejecting valid live payloads and breaking yard/admin flows — they should be added per-route with the client payload verified (ideally a UI smoke each). Residual risk is bounded today: queries are parameterized (no SQLi) and the Phase-1 `errorBoundary` turns any bad-type pg error into a generic 500 rather than a leak.

### Error message hygiene — ✅ DONE (Phase 1, `feat/logging-foundation`)
~20 sites did `res.status(500).json({ message: err.message || "Internal server error" })`. `err.message` from pg / Drizzle leaks SQL constraint names + column names; Twilio errors include phone numbers; Resend errors include API-side detail.

- ✅ Centralized `server/middleware/errorBoundary.ts` (logs full err via pino, returns generic message) mounted last in `server.js`.
- ✅ 25 `err.message`/`error.message` 5xx leaks across `routes/v2/{report,invoice,quote,sh_invoice,pnl}.js` genericized; Resend 502s → "Email could not be sent"; the Twilio SMS passthrough is intentionally kept (operator needs the trial-mode message) but now also logged.
- Note: 400-level validation/format messages were left intact (safe + useful); only 5xx provider/DB leakage was sanitized.

### Better Auth hardening — ✅ DONE (Phase 2, `feat/auth-hardening`)
- ✅ `BETTER_AUTH_SECRET` fail-fast at boot in `auth.js`.
- ✅ `advanced.defaultCookieAttributes = { httpOnly: true, sameSite: 'lax' }`; `secure` is driven by `advanced.useSecureCookies`, derived from the `BETTER_AUTH_URL` protocol (https → secure) so it's correct behind prod nginx **without** breaking local http dev — hardcoding `secure: true` would silently stop dev login (browser drops secure cookies over http).
- ✅ Impersonation blocked at the Express layer (`app.all('/api/auth/admin/impersonate-user', → 404)` before the auth catch-all). Verified in 1.6.10 source that `impersonationSessionDuration: 0` does **not** disable it (0 is falsy → falls back to the 1h default), hence the hard block.
- ⏸️ Google `hd` / email allowlist: deliberately **deferred + documented** in `auth.js`. New Google accounts land in `pending` (zero access until an admin promotes them); a hard allowlist carries login-lockout risk for marginal gain over the pending default. Revisit if signup spam appears.

### Auth-limiter granularity — ✅ DONE (Phase 2)
The `/api/auth/*` catch-all carried **no** limit (only `sign-in/*` was limited), so sign-up + forget/reset-password were unthrottled (account enumeration + spam-registration at full network speed). Added a stricter `signupLimiter` (10 / 15 min) on `/api/auth/sign-up/*`, `/forget-password`, `/request-password-reset`, `/reset-password`, mounted before the catch-all.

---

## PR #12 — medium polish + supply-chain

### Container + compose hardening
- Bind backend `3001:3001` and frontend `8080:8080` to `127.0.0.1` (ufw blocks them today but defense-in-depth).
- Add `read_only: true`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `mem_limit`, `pids_limit` to both services.
- Add healthchecks.
- Drop `host.docker.internal:host-gateway` if possible (containers reaching the EC2 host's full network); otherwise document why it's needed.
- ✅ **DONE (Phase 1):** log rotation `logging: { driver: json-file, options: { max-size: "10m", max-file: "5" }}` added to both compose services (closes the unbounded-log disk-exhaustion path — second one after PR #20's image accumulation).

### Supply chain
- Pin all Docker base images to SHA digests (`node:20-alpine@sha256:...`, `nginxinc/nginx-unprivileged:alpine@sha256:...`).
- Pin all third-party GHA actions to commit SHAs with comments (e.g. `actions/checkout@b4ffde65...  # v4.2.2`).
- Add Trivy or Grype scan step before image push; fail on HIGH/CRITICAL.
- Add cosign image signing.
- Enable Dependabot for the `.github/workflows/` ecosystem.

### Data minimization
- ✅ **DONE (Phase 3):** `GET /api/v1/inventory` no longer returns `acquisition_price` (internal cost) to non-admins — gated to `role === 'admin'`. Safe because the P&L panel reads cost from `/api/v2/pnl`, not this list.
- ⏭️ **Deferred:** `GET /api/v2/report` list still projects `resolved_data` jsonb. `Outbound.tsx` renders `report.resolved_data` directly off the list response, so dropping it needs a client refactor (fetch detail per-id) to avoid breaking the Outbound view.

### Public endpoint hardening
- ✅ **DONE:** `server/routes/public/receipt.js` — uniform 404 for not-found / revoked / expired / wrong-type (closes the token-existence oracle); 409 kept only for the legit "PDF still rendering" case.
- ✅ **DONE (Phase 1):** `POST /:id/sms` success response no longer echoes the receipt `token`.
- ✅ **DONE (Phase 3):** `503 SMS not configured` response no longer names the exact `TWILIO_*` env vars (generic message).

### Presigned-PUT restrictions — ⏳ PARTIAL (Phase 3)
- ✅ **SVG blocked** in `presignSchema` (`validation/intake.ts`) — the stored-XSS vector. Kept the permissive `image/*` match (not a hard enum) so varied mobile content-types don't break the yard upload; SVG is the only XSS-capable image subtype, so a precise block is as safe as an allowlist. Verified: jpeg/png/heic/webp accept, all `svg` variants reject.
- ⏭️ **Max-size** deferred: enforcing it means switching the presigned **PUT** to a presigned **POST** with a content-length-range policy, which also changes the client `uploadToS3` path — separate PR.
- ⏭️ **`Content-Disposition: attachment` on GET** deferred: `presignedGet` is shared with the driver-receipt PDF (`public/receipt.js`), so forcing attachment globally would regress the receipt's inline view. The SVG block already closes the vector at the source; add a per-call disposition param if defense-in-depth is wanted.

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
- **Employee can create (not send/edit) invoices, quotes, clients; employee batch S&H checkout** (`checkEmployee`). Intentional yard/sales workflow — employees draft + do yard checkout, admins finalize; every send/edit/delete path is `checkAdmin`. Documented 2026-06-19 (Phase 2).
- **User role-change / delete session invalidation** — verified non-issues: no session `cookieCache` (auth.js) so `getSession` re-reads `user.role` from the DB on every request (role changes apply immediately, no force-revoke needed); the `session` FK is `ON DELETE CASCADE` (migrate.js) so deleting a user revokes their sessions in the same statement.
