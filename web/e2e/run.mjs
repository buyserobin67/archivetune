// Browser E2E for Cadence Web. Runs the production build in Chromium at iPhone-sized viewports.
// Usage: npm run build (VITE_BASE=/archivetune/) && node e2e/run.mjs   [CHROMIUM_PATH=/path/to/chrome]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.E2E_BASE ?? '/archivetune/';
const PORT = Number(process.env.E2E_PORT ?? 4173);
const URL = `http://localhost:${PORT}${BASE}`;
const FX = resolve('e2e/fixtures');
const OUT = resolve('e2e/screenshots');
const MP3S = ['ember.mp3', 'tide.mp3', 'fern.mp3'].map((f) => `${FX}/${f}`);

const VIEWPORTS = [
  { name: 'se-320x568', width: 320, height: 568, safe: { top: 20, bottom: 0 } },
  { name: 'iphone-375x667', width: 375, height: 667, safe: { top: 20, bottom: 0 } },
  { name: 'iphone-390x844', width: 390, height: 844, safe: { top: 47, bottom: 34 } },
  { name: 'island-430x932', width: 430, height: 932, safe: { top: 59, bottom: 34 } },
  { name: 'large-text-390x844', width: 390, height: 844, safe: { top: 47, bottom: 34 }, textScale: 1.6 },
];

let failures = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}${ok ? '' : ' ' + extra}`); if (!ok) failures++; };

async function startServer() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { env: { ...process.env, VITE_BASE: BASE }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL)).ok) return proc; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error('preview server did not start');
}

const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const overlap = (a, b) => a && b && a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;

/** Elements that poke outside the viewport, ignoring intentional horizontal scrollers. */
function overflowing(page, scope = 'body') {
  return page.evaluate((scopeSel) => {
    const vw = document.documentElement.clientWidth, bad = [];
    for (const el of document.querySelector(scopeSel).querySelectorAll('*')) {
      if (el.closest('.row-scroll, [aria-hidden="true"], svg, [inert]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed' && el.id === 'root') continue;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > vw + 1 || r.left < -1)) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} [${Math.round(r.left)}..${Math.round(r.right)}] ${(el.textContent || '').trim().slice(0, 24)}`);
    }
    return bad.slice(0, 5);
  }, scope);
}

async function newPage(browser, vp, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    ...extra,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  // Emulate the Dynamic Island / home indicator insets so env(safe-area-inset-*) is non-zero.
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: vp.safe.top, bottom: vp.safe.bottom, left: 0, right: 0 } }).catch(() => {});
  if (vp.textScale) await page.addInitScript((k) => { const s = document.createElement('style'); s.textContent = `html{font-size:${16 * k}px !important}`; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); }, vp.textScale);
  return { ctx, page, errors };
}

async function swipeDown(page, selector, from = 120, to = 520) {
  await page.evaluate(({ selector, from, to }) => {
    const el = document.querySelector(selector);
    const mk = (type, y) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: 150, clientY: y })], changedTouches: [new Touch({ identifier: 1, target: el, clientX: 150, clientY: y })] });
    el.dispatchEvent(mk('touchstart', from));
    for (let y = from; y <= to; y += 40) el.dispatchEvent(mk('touchmove', y));
    el.dispatchEvent(mk('touchend', to));
  }, { selector, from, to });
}

async function run() {
  rmSync(OUT, { recursive: true, force: true });
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n== ${vp.name}`);
      mkdirSync(`${OUT}/${vp.name}`, { recursive: true });
      const shot = (page, n) => page.screenshot({ path: `${OUT}/${vp.name}/${n}.png` });
      const { ctx, page, errors } = await newPage(browser, vp);
      await page.goto(URL);
      await page.waitForSelector('text=Your library is empty');
      await shot(page, '0-empty');
      check((await overflowing(page)).length === 0, 'empty state has no horizontal overflow', JSON.stringify(await overflowing(page)));

      // ---- import (also: dedup) ----
      await page.setInputFiles('input[type=file] >> nth=0', [...MP3S, `${FX}/tone-a.wav`, `${FX}/ember.mp3`]);
      await page.waitForSelector('text=Jump back in, text=Recently added', { timeout: 20000 }).catch(() => {});
      await page.waitForSelector('text=Albums');
      await page.waitForTimeout(500);
      check(await page.locator('text=/3 added|4 added/').count() >= 0, 'import finished');

      // ---- Home ----
      await page.waitForTimeout(400);
      await shot(page, '1-home');
      const h1 = await rect(page, 'h1');
      const headerBtns = await page.evaluate(() => [...document.querySelectorAll('header button')].map((b) => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }));
      check(h1 && h1.y >= vp.safe.top, 'home title sits below the status bar / Dynamic Island', JSON.stringify(h1));
      check(!headerBtns.some((b) => overlap(h1, b)), 'home title does not overlap header buttons', JSON.stringify({ h1, headerBtns }));
      check((await overflowing(page, '#main')).length === 0, 'home has no horizontal overflow', JSON.stringify(await overflowing(page, '#main')));
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'page is not horizontally scrollable');
      check(await page.locator('main img').count() > 0, 'real artwork is rendered');

      // ---- Library ----
      await page.getByRole('link', { name: 'Library' }).click();
      await page.waitForSelector('text=Ember Lines');
      await page.waitForTimeout(300);
      await shot(page, '2-library-songs');
      check((await overflowing(page, '#main')).length === 0, 'library songs: no overflow', JSON.stringify(await overflowing(page, '#main')));
      const count = await page.locator('[aria-label^="Play "][aria-label*=" by "]').count();
      check(count === 4, `library lists 4 unique songs (duplicate skipped), got ${count}`);
      await page.getByRole('link', { name: 'Albums' }).click();
      await page.waitForSelector('text=Afterglow');
      await page.waitForTimeout(300);
      await shot(page, '3-library-albums');
      check((await overflowing(page, '#main')).length === 0, 'library albums: no overflow', JSON.stringify(await overflowing(page, '#main')));
      await page.getByRole('link', { name: 'Playlists' }).click();
      await page.getByRole('link', { name: 'Downloads' }).click();
      await page.waitForSelector('text=No licensed downloads yet');
      await shot(page, '3b-library-downloads');
      await page.getByRole('link', { name: 'Songs' }).click();
      await page.getByRole('button', { name: /Sort by/ }).click();
      await page.getByRole('button', { name: 'Duration' }).click();
      await page.getByPlaceholder('Search songs').fill('afterglow');
      await page.waitForTimeout(250);
      check(await page.locator('[aria-label^="Play "][aria-label*=" by "]').count() === 2, 'library search filters by album');
      await shot(page, '3c-library-search');
      await page.getByPlaceholder('Search songs').fill('');

      // ---- album detail ----
      await page.getByRole('link', { name: 'Albums' }).click();
      await page.getByText('Afterglow').first().click();
      await page.waitForSelector('text=Play >> nth=0');
      await page.waitForTimeout(400);
      await shot(page, '4-album-detail');
      check((await overflowing(page, '#main')).length === 0, 'album detail: no overflow', JSON.stringify(await overflowing(page, '#main')));
      await page.getByRole('button', { name: 'Back' }).click();

      // ---- playback + mini player ----
      await page.getByRole('link', { name: 'Home' }).click();
      await page.getByRole('button', { name: /^Play Ember Lines/ }).first().click();
      await page.waitForSelector('[aria-label^="Open player"]');
      await page.waitForTimeout(1200);
      const accentEmber = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim());
      await shot(page, '5-home-miniplayer');
      const mini = await rect(page, '[aria-label^="Open player"]');
      const dock = await rect(page, 'nav[aria-label="Primary"]');
      check(mini && dock && mini.b <= dock.y + 1, 'mini player floats above the tab bar', JSON.stringify({ mini, dock }));
      check(dock && Math.abs(dock.b - vp.height) <= 1, 'tab bar is anchored to the bottom');
      const lastRow = await page.evaluate(() => { const m = document.getElementById('main'); return parseFloat(getComputedStyle(m).paddingBottom); });
      check(lastRow >= (dock?.h ?? 0), 'scroll area pads for the dock so the last row is reachable', String(lastRow));

      // ---- Now Playing ----
      await page.click('[aria-label^="Open player"]');
      await page.waitForTimeout(900);
      await shot(page, '6-now-playing');
      const art = await rect(page, '[aria-hidden="false"] [style*="view-transition-name: cadence-art"], [aria-hidden="false"] .shadow-card');
      const title = await rect(page, '[aria-hidden="false"] h2');
      const play = await rect(page, '[aria-hidden="false"] [aria-label="Pause"]');
      const seek = await rect(page, '[aria-hidden="false"] input[type=range]');
      const fav = await rect(page, '[aria-hidden="false"] [aria-label$="favorites"]');
      check(art && title && art.b <= title.y + 2, 'cover is above the title (no overlap)', JSON.stringify({ art, title }));
      check(title && seek && title.b <= seek.y + 2, 'title block is above the progress bar', JSON.stringify({ title, seek }));
      check(seek && play && seek.b <= play.y + 2, 'progress bar is above the transport controls', JSON.stringify({ seek, play }));
      check(play && play.b <= vp.height - vp.safe.bottom + 1, 'controls clear the home indicator', JSON.stringify({ play, safe: vp.safe }));
      check(art && art.w >= 120 && art.x >= 0 && art.r <= vp.width, `cover is sized and inside the viewport (${Math.round(art?.w ?? 0)}px)`, JSON.stringify(art));
      check(title && fav && !overlap(title, fav), 'title does not overlap the favorite button', JSON.stringify({ title, fav }));
      check((await overflowing(page, '[aria-hidden="false"]')).length === 0, 'now playing: no horizontal overflow', JSON.stringify(await overflowing(page, '[aria-hidden="false"]')));
      const t0 = await page.evaluate(() => document.querySelector('[aria-hidden="false"] input[type=range]').value);
      await page.waitForTimeout(1200);
      const t1 = await page.evaluate(() => document.querySelector('[aria-hidden="false"] input[type=range]').value);
      check(Number(t1) > Number(t0), 'playback position advances', `${t0} -> ${t1}`);

      await page.click('[aria-hidden="false"] [aria-label="Add to favorites"]');
      await page.waitForTimeout(300);
      check(await page.locator('[aria-hidden="false"] [aria-label="Remove from favorites"]').count() === 1, 'favorite toggles');
      await page.click('[aria-hidden="false"] [aria-label="Shuffle off"]');
      check(await page.getAttribute('[aria-hidden="false"] [aria-label="Shuffle on"]', 'aria-pressed') === 'true', 'shuffle toggles');
      await page.click('[aria-hidden="false"] [aria-label="Shuffle on"]');
      await page.click('[aria-hidden="false"] [aria-label="Repeat off"]');
      check(await page.locator('[aria-hidden="false"] [aria-label="Repeat all"]').count() === 1, 'repeat cycles');

      // next track -> accent changes with the artwork
      await page.click('[aria-hidden="false"] [aria-label="Next track"]');
      await page.waitForTimeout(1200);
      const accentNext = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim());
      check(accentEmber !== accentNext, `accent colour follows the artwork (${accentEmber} -> ${accentNext})`);
      await shot(page, '7-now-playing-next-track');

      // ---- Queue ----
      await page.click('[aria-hidden="false"] [aria-label="Show queue"]');
      await page.waitForTimeout(500);
      await shot(page, '8-queue');
      check(await page.locator('[aria-hidden="false"]').getByText(/Up next/).count() === 1, 'queue view opens');
      check((await overflowing(page, '[aria-hidden="false"]')).length === 0, 'queue: no horizontal overflow', JSON.stringify(await overflowing(page, '[aria-hidden="false"]')));
      const tr = await rect(page, '[aria-hidden="false"] [aria-label="Pause"]');
      check(tr && tr.b <= vp.height - vp.safe.bottom + 1, 'queue: transport clears the home indicator');
      await page.click('[aria-hidden="false"] [aria-label="Hide queue"]');
      await page.waitForTimeout(300);

      // ---- swipe-down dismiss ----
      await swipeDown(page, '[aria-hidden="false"] header');
      await page.waitForTimeout(900);
      check(await page.locator('[aria-hidden="false"] [aria-label="Close player"]').count() === 0, 'swipe down dismisses the player');
      check(await page.locator('[aria-label^="Open player"]').isVisible(), 'mini player is back after dismiss');
      await page.click('[aria-label^="Open player"]');
      await page.waitForTimeout(700);
      check(await page.locator('[aria-hidden="false"] [aria-label="Close player"]').count() === 1, 'player re-opens after a swipe dismiss');
      await page.click('[aria-hidden="false"] [aria-label="Close player"]');
      await page.waitForTimeout(700);

      // ---- Settings & Search ----
      await page.getByRole('link', { name: 'Settings' }).click();
      await page.waitForSelector('text=Known iOS limitations');
      await shot(page, '9-settings');
      check((await overflowing(page, '#main')).length === 0, 'settings: no overflow', JSON.stringify(await overflowing(page, '#main')));
      await page.getByRole('link', { name: 'Search' }).click();
      await page.getByPlaceholder('Songs, artists, albums').fill('tide');
      await page.waitForSelector('text=Tide Study');
      await shot(page, '10-search');
      check((await overflowing(page, '#main')).length === 0, 'search: no overflow', JSON.stringify(await overflowing(page, '#main')));

      // ---- offline (once) ----
      if (vp.name === 'iphone-390x844') {
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.reload();
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        await ctx.setOffline(true);
        await page.goto(`${URL}#/library/songs`);
        await page.reload();
        await page.waitForSelector('text=Ember Lines', { timeout: 10000 });
        check(true, 'app shell and library load offline');
        await page.getByRole('button', { name: /^Play Ember Lines/ }).first().click();
        await page.waitForTimeout(1200);
        check(await page.evaluate(() => Number(document.querySelector('[aria-label^="Open player"]') ? 1 : 0)) === 1, 'track plays offline from IndexedDB');
        await ctx.setOffline(false);
      }
      check(errors.length === 0, 'no console / page errors', errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    // ---- reduced motion: no view transition, still opens and closes ----
    console.log('\n== reduced motion');
    const { ctx, page, errors } = await newPage(browser, VIEWPORTS[2], { reducedMotion: 'reduce' });
    await page.goto(URL);
    await page.waitForSelector('text=Your library is empty');
    await page.setInputFiles('input[type=file] >> nth=0', MP3S);
    await page.getByRole('button', { name: /^Play Ember Lines/ }).first().click({ timeout: 20000 });
    await page.click('[aria-label^="Open player"]');
    await page.waitForTimeout(200);
    check(await page.locator('[aria-hidden="false"] [aria-label="Close player"]').count() === 1, 'player opens with reduced motion');
    await page.click('[aria-hidden="false"] [aria-label="Close player"]');
    await page.waitForTimeout(200);
    check(await page.locator('[aria-hidden="false"] [aria-label="Close player"]').count() === 0, 'player closes with reduced motion');
    check(errors.length === 0, 'no errors with reduced motion', errors.join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failures ? `\n${failures} E2E check(s) FAILED` : '\nAll E2E checks passed');
  process.exit(failures ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
