// Screenshots of the same flow for any build, for before/after comparisons.
// Usage: SHOTS_DIR=/path/to/web SHOTS_OUT=/out node e2e/shots.mjs   (SHOTS_DIR must contain a built dist/ for base /archivetune/)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(process.env.SHOTS_DIR ?? '.');
const OUT = resolve(process.env.SHOTS_OUT ?? 'e2e/shots');
const PORT = Number(process.env.SHOTS_PORT ?? 4191);
const FX = resolve(process.env.FIXTURES ?? 'e2e/fixtures');
const URL = `http://localhost:${PORT}/archivetune/`;
const FILES = (process.env.SHOTS_FILES ?? 'art-transparent.mp3').split(',').map((f) => `${FX}/${f}`);
mkdirSync(OUT, { recursive: true });

const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: DIR, env: { ...process.env, VITE_BASE: '/archivetune/' }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 62, bottom: 34, left: 0, right: 0 } }).catch(() => {});
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.goto(URL);
  await page.waitForSelector('text=Welcome to Cadence');
  await page.setInputFiles('input[type=file] >> nth=0', FILES);
  await page.waitForSelector('text=Quick Picks', { timeout: 20000 });
  await page.waitForTimeout(1800); // let the background trim pass finish where it exists
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  await page.getByRole('button', { name: /^Play / }).first().click();
  await page.waitForSelector('[aria-label^="Open player"]');
  await page.waitForTimeout(900);
  await shot('1-home');
  await page.locator('nav[aria-label="Primary"]').getByRole('link', { name: 'Library' }).click();
  await page.waitForTimeout(500);
  await shot('2-library');
  await page.locator('nav[aria-label="Primary"]').getByRole('link', { name: 'Search' }).click();
  await page.waitForTimeout(500);
  await shot('3-search');
  await page.locator('nav[aria-label="Primary"]').getByRole('link', { name: 'Library' }).click();
  await page.getByRole('link', { name: 'Albums' }).click();
  await page.locator('main a[href*="albums/"]').first().click();
  await page.waitForTimeout(700);
  await shot('4-album');
  await page.click('[aria-label^="Open player"]');
  await page.waitForTimeout(1000);
  await shot('5-now-playing');
  await page.click('[aria-hidden="false"] [aria-label="Show queue"]');
  await page.waitForTimeout(600);
  await shot('6-queue');
  await page.click('[aria-hidden="false"] [aria-label="Hide queue"]');
  await page.click('[aria-hidden="false"] [aria-label="Close player"]');
  await page.waitForTimeout(700);
  console.log('shots written to', OUT);
} finally { await browser.close(); srv.kill(); }
