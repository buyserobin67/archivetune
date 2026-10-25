// Artwork rendering check in a real WebKit engine (what Safari/iOS use). Run in CI: `npx playwright install webkit` first.
// Proves, per cover type, whether bars come from the app's CSS or from the image's own pixels.
// E2E_BROWSER=chromium runs the same script in Chromium (local sanity check).
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const BASE = process.env.E2E_BASE ?? '/archivetune/';
const PORT = Number(process.env.E2E_PORT ?? 4174);
const URL = `http://localhost:${PORT}${BASE}`;
const FX = resolve('e2e/fixtures');
const engine = process.env.E2E_BROWSER === 'chromium' ? chromium : webkit;
let failures = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}${ok ? '' : ' ' + extra}`); if (!ok) failures++; };

const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { env: { ...process.env, VITE_BASE: BASE }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await engine.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  console.log(`engine: ${engine.name()} ${browser.version()}`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: engine === chromium, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForSelector('text=Welcome to Cadence');
  await page.setInputFiles('input[type=file] >> nth=0', ['art-pillarbox', 'art-landscape', 'art-letterbox', 'art-portrait', 'art-transparent'].map((n) => `${FX}/${n}.mp3`));
  await page.waitForSelector('text=Quick Picks', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const BG = [36, 38, 41];
  const bgShare = async (title) => {
    const card = page.locator('main a[href*="albums/"]', { hasText: title }).locator('.aspect-square').first();
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await card.locator('img').first().evaluate((img) => img.decode().catch(() => {}));
    await page.waitForTimeout(500);
    const buf = await card.screenshot();
    return page.evaluate(async ([b64, bg]) => {
      const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const mx = Math.round(c.width * 0.12), my = Math.round(c.height * 0.12);
      let n = 0, tot = 0;
      for (let yy = my; yy < c.height - my; yy++) for (let xx = mx; xx < c.width - mx; xx++) {
        const i = (yy * c.width + xx) * 4; tot++;
        if (Math.abs(d[i] - bg[0]) <= 3 && Math.abs(d[i + 1] - bg[1]) <= 3 && Math.abs(d[i + 2] - bg[2]) <= 3) n++;
      }
      return n / tot;
    }, [buf.toString('base64'), BG]);
  };

  await page.goto(`${URL}#/library/albums`);
  await page.waitForSelector('text=Art Test E');
  await page.waitForTimeout(1500);
  const pct = (v) => `${Math.round(v * 100)}% bars`;
  const a = await bgShare('Art Test A'), b = await bgShare('Art Test B'), d = await bgShare('Art Test D'), e = await bgShare('Art Test E'), c = await bgShare('Art Test C');
  check(a < 0.02, `[${engine.name()}] 16:9 pillarboxed cover fills the square via object-fit: cover (${pct(a)})`);
  check(b < 0.02, `[${engine.name()}] landscape cover fills the square (${pct(b)})`);
  check(d < 0.02, `[${engine.name()}] portrait cover fills the square (${pct(d)})`);
  check(e < 0.02, `[${engine.name()}] cover with transparent bars is trimmed (${pct(e)})`);
  check(c > 0.2, `[${engine.name()}] image with opaque flat bars keeps them until trimmed (${pct(c)}): bars in the file are not a CSS problem`);

  await page.goto(`${URL}#/settings`);
  await page.getByRole('button', { name: 'Scan artwork' }).click();
  await page.waitForSelector('ul[aria-label="Artwork scan results"] li');
  await page.waitForTimeout(500);
  const rows = await page.locator('ul[aria-label="Artwork scan results"] li').allInnerTexts();
  check(rows.length === 5 && rows.every((r) => /Render check: OK/.test(r)), `[${engine.name()}] render check passes for every cover: object-fit and box size behave`, rows.join(' / '));

  await page.locator('ul[aria-label="Artwork scan results"] li', { hasText: 'Transparent Bars' }).getByRole('button', { name: 'Use original' }).click();
  await page.waitForTimeout(600);
  await page.goto(`${URL}#/library/albums`);
  await page.waitForSelector('text=Art Test E');
  await page.waitForTimeout(800);
  const bars = await bgShare('Art Test E');
  check(bars > 0.2, `[${engine.name()}] untouched transparent-bar image shows bars in this engine too (${pct(bars)}): reproduces the report, cause is the image`);
  check(errors.length === 0, 'no page errors', errors.join(' | '));
} finally { await browser.close(); srv.kill(); }
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll artwork checks passed');
process.exit(failures ? 1 : 0);
