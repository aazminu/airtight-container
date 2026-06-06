# Postmortem: Airtight service outage (EC2 hard-lock)

**Date of incident:** 2026-06-04 (failure observed; box frozen from ~04:09 UTC)
**Status:** Root cause confirmed. Mitigations identified, not yet applied.
**Audience:** Claude Code agent — this document is context for implementing the fix.

---

## TL;DR

The EC2 instance hard-locked because the **backend container's Puppeteer / headless Chromium usage exhausted memory** on a **1 GB instance with zero swap**. The box was under continuous, severe memory pressure for ~18 hours, then froze completely — which is why SSH hung. A manual reboot brought it back. The OOM killer had been firing (it killed a Chromium process), but with no swap the machine eventually thrashed into a total lockup rather than recovering.

**The cure** is fixing the Puppeteer lifecycle in the backend code. **The seatbelts** are adding swap, capping container memory, and right-sizing the instance.

---

## Environment

- **Instance:** ~954 MB RAM (1 GB class, e.g. t2/t3.micro), **0 swap**.
- **Root disk:** 19 GB, 79% used (~4 GB free) — NOT a factor.
- **OS:** Ubuntu 24.x, systemd, persistent journald.
- **Working dir:** `~/airtight-container` (docker compose project).
- **Services on the host:** PostgreSQL 16, nginx, Docker/containerd, two Node containers, amazon-ssm-agent, snapd.
- **Containers:**
  - `airtight-container-frontend-1` — `ghcr.io/harrylynchh/airtight-frontend:latest`, serves on `8080`. nginx-based static/frontend.
  - `airtight-container-backend-1` — `ghcr.io/harrylynchh/airtight-backend:latest`, serves on `3001`. **This is the culprit.**

### Backend dependencies (from package.json)
```
@aws-sdk/client-s3, @aws-sdk/client-textract, @aws-sdk/s3-request-presigner,
better-auth, cors, dotenv, drizzle-orm, express, express-rate-limit, helmet,
node-cron, pg, puppeteer (^24.43.1), react, react-dom, resend, tsx, twilio, zod
```
- `puppeteer` is installed; `/usr/bin/chromium` exists in the image.
- `node-cron` is present → there may be a **scheduled job** invoking Puppeteer.
- `@aws-sdk/client-textract` + `client-s3` → likely workflow is HTML→PDF or screenshot rendering, possibly uploaded to S3, possibly OCR'd.

---

## Timeline (UTC)

- **Boot `-2`** (the long-lived production boot): ran Feb 24 → Jun 4 04:09:14.
- **Jun 3, ~10:20** — Kernel OOM event. `Out of memory: Killed process 1147045 (chromium) total-vm:50794040kB, anon-rss:25448kB ... UID:100`. OOM dump confirms `Total swap = 0kB`.
- **Jun 3 ~17:00 → Jun 4 04:09** — Unbroken wall of `systemd-journald: Under memory pressure, flushing caches`, accelerating toward the end. System chronically starved for ~18h.
- Collateral failures during starvation: `snapd.service: Watchdog timeout`, repeated `snapd start operation timed out`, `DHCPv4 ... Connection timed out`, `apt-daily.service failed`. These are **symptoms**, not causes — a box too starved to schedule processes.
- **Jun 4 04:09:14** — last log line of boot `-2`, mid-stream, **no shutdown sequence**. This is the freeze. SSH hangs here.
- **Jun 4 04:13:25–04:13:43** — boot `-1`: an 18-second clean poweroff = the user-initiated reboot.
- **Jun 4 04:14:37+** — boot `0`: current healthy boot. Containers came back up via restart policy (`Up 7 minutes`, `Created 5 days ago` → restarted, not recreated; pre-crash docker logs preserved).

---

## Evidence chain (how we know)

1. **Disk ruled out:** `df -h` showed 79% used, persistent volume → if it had filled pre-reboot it would still be full. It wasn't.
2. **Memory confirmed as the axis:** `free -m` showed 954 MB total, **0 swap**.
3. **OOM confirmed:** `journalctl -b -2 -p warning` surfaced the kernel OOM dump killing `chromium`, with `Total swap = 0kB`.
4. **Freeze confirmed:** boot `-2` ends mid-log with no shutdown lines; ~4-min gap to next boot = dead/frozen window matching the SSH hang.
5. **Source confirmed:** `docker exec ... backend-1` showed `puppeteer` in `node_modules/.bin` and `/usr/bin/chromium` present. The OOM'd Chromium (host `UID:100`) maps to the container's service user.
6. **Frontend ruled out:** frontend "chrome" log hits were just bot User-Agent strings, not a running browser.

---

## Root cause

The backend uses **Puppeteer (headless Chromium)** for rendering (likely PDF/screenshot generation, possibly on a `node-cron` schedule). On a 1 GB box with no swap, Chromium's memory footprint (300–500 MB per active render) plus Postgres + nginx + Docker + two Node apps left no headroom. The most likely code-level bug is a **leaked browser and/or page** (launched but never `.close()`d) or **launching a browser per request/job** instead of reusing one. With no swap to absorb the spikes, the kernel OOM-killed Chromium repeatedly and ultimately the whole machine thrashed into a hard lock.

`node-cron` + a per-run leak would produce the observed slow ~18h climb independent of user traffic — this is the leading hypothesis for the *pattern* and should be checked first.

---

## Fixes

### 1. Code fix (the cure) — backend Puppeteer lifecycle

Audit how Puppeteer is invoked. Starting point:
```
docker exec airtight-container-backend-1 sh -c 'grep -rn "puppeteer\|\.launch(\|\.newPage(\|\.close()" --include=*.ts --include=*.js src 2>/dev/null | head -40'
```

Verify and enforce:
- Every `browser.launch()` has a matching `browser.close()` in a **`finally`** block (closes even on throw).
- Every `browser.newPage()` has a matching `page.close()` (leaked pages are as fatal as leaked browsers).
- **Do not launch a browser per request/job.** Reuse one long-lived browser instance, or if launching per-job, guarantee teardown.
- If a `node-cron` job uses Puppeteer, confirm runs can't overlap (a slow run + next tick = two concurrent Chromiums).

Robust pattern:
```js
let browser;
try {
  browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process']
  });
  const page = await browser.newPage();
  try {
    // ... render / pdf ...
  } finally {
    await page.close();
  }
} finally {
  if (browser) await browser.close();
}
```
- `--disable-dev-shm-usage`: **critical in Docker** — Chromium defaults to `/dev/shm`, which is tiny in containers; without this it can balloon or crash.
- `--single-process`: reduces footprint on a small box (slight stability tradeoff — test it).
- `--no-sandbox`: typically required when running as root in a container.

### 2. Swap (seatbelt — do immediately, prevents hard-lock)
```
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -m   # confirm Swap is nonzero
```
This alone would likely have kept the box reachable during the incident (degrade instead of freeze).

### 3. Cap container memory (seatbelt — contain the blast radius)
In the compose file:
```yaml
  backend:
    mem_limit: 600m
    restart: unless-stopped
```
A capped container gets OOM-killed and auto-restarted in isolation, instead of dragging down the host.

### 4. Right-size the instance (seatbelt — remove the structural squeeze)
Postgres + nginx + Docker + two Node containers + headless Chromium on 954 MB is under-provisioned even with perfect code.
- **Floor:** t3.small (2 GB).
- **Recommended if PDF/render is a core feature:** 4 GB.
- Check current type: `curl http://169.254.169.254/latest/meta-data/instance-type` (or `ec2-metadata --instance-type`).

### Suggested order of operations
1. Add swap (5 min, immediate safety net).
2. Read the Puppeteer code via the grep above; patch close/teardown and concurrency. **(Root-cause fix.)**
3. Add the container memory cap.
4. Plan/execute the instance bump.

---

## Secondary / unrelated findings (not the cause — backlog)

- **Bot scanning:** A single IP (`20.116.59.164`) was probing the frontend for vulns (`/wp-admin/`, `/sql.php`, `/info.php`, `/.well-known/*.php`, etc.). Not running WordPress/PHP so the probes 200'd harmlessly, but worth hardening later (fail2ban, security-group tightening, or returning 404s). **Not related to the outage.**
- **snapd churn / watchdog timeouts:** symptoms of the starvation, not a separate issue. Should clear once memory is healthy.

---

## Open questions for the fix

1. Where exactly is Puppeteer invoked — per HTTP request, or via `node-cron`? (Determines whether the fix is teardown, reuse, or concurrency-throttling.)
2. Is there a long-lived browser instance pattern already, or launch-per-call?
3. What's the current EC2 instance type? (Confirms how tight the budget really is.)