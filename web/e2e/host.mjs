// Service worker install + "Check for updates" against a server that behaves like Cloudflare Pages:
// `_headers` / `_redirects` are config and answer 404, and `/index.html` redirects to `/`.
// Then a new deploy is faked (sw.js bytes change) and the app must offer "Restart to update".
// Usage: npm run build && node e2e/host.mjs      (builds with base "/", as Cloudflare does)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const DIST = resolve(process.env.HOST_DIST ?? 'dist');
const PORT = Number(process.env.HOST_PORT ?? 4195);
const URL = `http://localhost:${PORT}/`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
let swExtra = '';

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` ${detail}`}`); if (!ok) failed++; };

const server = createServer((req, res) => {
  const path = decodeURIComponent(new globalThis.URL(req.url, URL).pathname);
  if (path === '/index.html') { res.writeHead(308, { Location: '/' }); return res.end(); }
  if (/^\/(_headers|_redirects|_routes\.json)$/.test(path)) { res.writeHead(404); return res.end('Not found'); }
  const file = join(DIST, path === '/' ? 'index.html' : path);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  let body = readFileSync(file);
  if (path === '/sw.js' && swExtra) body = Buffer.concat([body, Buffer.from(swExtra)]);
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(body);
}).listen(PORT);

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(URL);
  const active = await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready.then((r) => r.active?.state ?? 'none'),
    new Promise((ok) => setTimeout(() => ok('timeout'), 8000)),
  ]));
  check(active === 'activated' || active === 'activating', 'the service worker installs on a Cloudflare-like host', active);

  await page.goto(`${URL}#/settings`);
  const button = page.getByRole('button', { name: 'Check for updates' });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const status = page.locator('[data-testid="about-data"] [role="status"]');
  await page.waitForFunction((el) => el && /Up to date|could not|Could not/.test(el.textContent ?? ''), await status.elementHandle(), { timeout: 8000 }).catch(() => {});
  const text = await status.innerText();
  check(/^Up to date/.test(text), '"Check for updates" answers Up to date while online', text);

  swExtra = '\n// next deploy\n';
  await button.click();
  await page.waitForSelector('text=Restart to update', { timeout: 10000 }).catch(() => {});
  check(await page.getByRole('button', { name: 'Restart to update' }).count() === 1, 'a new deploy is offered as "Restart to update"');
  await page.getByRole('button', { name: 'Restart to update' }).click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  const version = await page.evaluate(() => new Promise((ok) => {
    const c = navigator.serviceWorker.controller;
    if (!c) return ok(null);
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => ok(e.data?.version ?? null);
    c.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
  }));
  check(!!version, 'after Restart the new worker controls the app', String(version));

  // Offline is covered by unit tests (update.test.ts): Playwright's offline mode does not reach the browser's own
  // service-worker update request, so it cannot be faked here.
  check(errors.length === 0, 'no page errors', errors.join(' | '));
} finally { await browser.close(); server.close(); }
console.log(failed ? `\n${failed} host check(s) FAILED` : '\nall host checks passed');
process.exit(failed ? 1 : 0);
