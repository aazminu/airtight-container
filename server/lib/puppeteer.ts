// Shared headless-Chromium lifecycle for all server-side PDF rendering
// (invoice / report / quote). Previously each render module held its own
// module-singleton browser, so a backend process kept up to THREE
// resident Chromiums. On the 1 GB production box that was the structural
// squeeze behind the 2026-06-04 OOM hard-lock (see docs/postmortem.md):
// three ~300-500 MB browsers left no headroom alongside Postgres + nginx
// + Docker + two Node apps.
//
// This module is the single owner of the one shared browser. Render
// modules go through withPage(); they never launch or close Chromium
// themselves.
//
// Two safeguards against long-run memory creep:
//   - Periodic recycle: after PUPPETEER_MAX_RENDERS pages or
//     PUPPETEER_MAX_AGE_MS of uptime, the browser is closed and the next
//     getBrowser() relaunches a fresh one. Chromium leaks slowly across
//     many page lifecycles; recycling reclaims it.
//   - Recycle never fires while a render is in flight (_active > 0), so a
//     concurrent render can't have its browser yanked mid-pdf.

import puppeteer, { type Browser, type Page } from 'puppeteer';

let _browser: Browser | null = null;
let _launching: Promise<Browser> | null = null;
let _renders = 0; // pages rendered on the CURRENT browser
let _launchedAt = 0; // Date.now() when the current browser launched
let _active = 0; // renders currently holding a page open

const MAX_RENDERS = Number(process.env.PUPPETEER_MAX_RENDERS ?? 50);
const MAX_AGE_MS = Number(
  process.env.PUPPETEER_MAX_AGE_MS ?? 6 * 60 * 60 * 1000,
);

// --disable-dev-shm-usage is critical in Docker (the default /dev/shm is
// tiny). --disable-gpu drops the GPU stack we never use. The max-old-space
// cap keeps V8's heap modest since our pages are small SSR'd documents.
//
// NB: --single-process / --no-zygote were tried (postmortem suggested
// them for a tight box) but reliably HANG page.pdf() in headless
// Chromium 24 — verified locally. The memory win comes from sharing one
// browser + recycling, not from collapsing Chromium's process model.
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--js-flags=--max-old-space-size=256',
];

async function launch(): Promise<Browser> {
  const browser = await puppeteer.launch({ headless: true, args: LAUNCH_ARGS });
  _browser = browser;
  _renders = 0;
  _launchedAt = Date.now();
  return browser;
}

export async function getBrowser(): Promise<Browser> {
  if (_browser) return _browser;
  // Collapse concurrent first-launch races onto one launch() promise.
  if (!_launching) {
    _launching = launch().finally(() => {
      _launching = null;
    });
  }
  return _launching;
}

export async function closeBrowser(): Promise<void> {
  const browser = _browser;
  _browser = null;
  if (browser) await browser.close();
}

// Recycle is fire-and-forget on purpose. We swap the browser reference
// out synchronously (so the next getBrowser() launches a fresh one) and
// close the old one in the background. The render path must NEVER await
// browser.close(): Chromium teardown can be slow or wedge, and blocking
// a render's finally on it would hang the HTTP response. The old browser
// has no in-flight pages here (_active === 0), so detaching it is safe.
function maybeRecycle(): void {
  if (_active > 0 || !_browser) return;
  const aged = Date.now() - _launchedAt >= MAX_AGE_MS;
  const spent = _renders >= MAX_RENDERS;
  if (!(aged || spent)) return;
  const old = _browser;
  _browser = null;
  void old.close().catch(() => {});
}

// Acquire a fresh page on the shared browser, run fn, and always close
// the page + advance the recycle bookkeeping. This is the only entry
// point render modules should use.
export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await getBrowser();
  _active++;
  const page = await browser.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
    _active--;
    _renders++;
    maybeRecycle();
  }
}
