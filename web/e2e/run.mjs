// Browser E2E for Cadence Web. Runs the production build in Chromium at iPhone-sized viewports.
// Usage: VITE_BASE=/archivetune/ npm run build && node e2e/run.mjs   [CHROMIUM_PATH=/path/to/chrome] [E2E_BASE=/archivetune/]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.E2E_BASE ?? '/archivetune/';
const PORT = Number(process.env.E2E_PORT ?? 4173);
const URL = `http://localhost:${PORT}${BASE}`;
const FX = resolve('e2e/fixtures');
const OUT = resolve('e2e/screenshots');
const AUDIO = ['ember.mp3', 'tide.mp3', 'fern.mp3', 'extra0.mp3', 'extra1.mp3', 'extra2.mp3', 'extra3.mp3', 'tone-a.wav'].map((f) => `${FX}/${f}`);
const IMPORT_ALL = [...AUDIO, `${FX}/ember.lrc`, `${FX}/ember.mp3`]; // + lyric sidecar + a duplicate

const VIEWPORTS = [
  { name: 'se-320x568', width: 320, height: 568, safe: { top: 20, bottom: 0 } },
  { name: 'iphone-375x667', width: 375, height: 667, safe: { top: 20, bottom: 0 } },
  { name: 'iphone-390x844', width: 390, height: 844, safe: { top: 47, bottom: 34 } },
  { name: 'island-430x932', width: 430, height: 932, safe: { top: 59, bottom: 34 } },
  { name: 'standalone-402x874', width: 402, height: 874, safe: { top: 62, bottom: 34 }, standalone: true },
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
const P = '[aria-hidden="false"]'; // the open player

/** Elements that poke outside the viewport, ignoring intentional horizontal scrollers. */
function overflowing(page, scope = 'body') {
  return page.evaluate((scopeSel) => {
    const vw = document.documentElement.clientWidth, bad = [];
    for (const el of document.querySelector(scopeSel).querySelectorAll('*')) {
      if (el.closest('.row-scroll, svg, [inert], [aria-hidden="true"]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > vw + 1 || r.left < -1)) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} [${Math.round(r.left)}..${Math.round(r.right)}] ${(el.textContent || '').trim().slice(0, 24)}`);
    }
    return bad.slice(0, 5);
  }, scope);
}
const noOverflow = async (page, scope, what) => { const bad = await overflowing(page, scope); check(bad.length === 0, `${what}: no horizontal overflow`, JSON.stringify(bad)); };

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
  // Home Screen app: display-mode: standalone (what iOS reports for installed PWAs).
  // iOS exposes this as navigator.standalone; other browsers via the display-mode media query.
  if (vp.standalone) await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); });
  if (vp.textScale) await page.addInitScript((k) => { const s = document.createElement('style'); s.textContent = `html{font-size:${16 * k}px !important}`; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); }, vp.textScale);
  return { ctx, page, errors, cdp };
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
    const only = process.env.E2E_ONLY?.split(',');
    for (const vp of VIEWPORTS.filter((v) => !only || only.includes(v.name))) {
      console.log(`\n== ${vp.name}`);
      mkdirSync(`${OUT}/${vp.name}`, { recursive: true });
      const shot = (page, n) => page.screenshot({ path: `${OUT}/${vp.name}/${n}.png` });
      const { ctx, page, errors } = await newPage(browser, vp);
      await page.goto(URL);
      await page.waitForSelector('text=Welcome to Cadence');
      await page.waitForTimeout(300);

      // ---- Home, empty library ----
      await shot(page, '0-home-empty');
      const welcome = await rect(page, 'section[aria-labelledby="welcome-title"]');
      const importBtn = await rect(page, 'section[aria-labelledby="welcome-title"] button');
      const nav = await rect(page, 'nav[aria-label="Primary"] ul');
      const k = vp.textScale ?? 1;
      check(welcome && welcome.h <= vp.height * (0.45 + (k - 1) * 0.12), `empty welcome card is compact (${Math.round(welcome?.h)}px of ${vp.height})`, JSON.stringify(welcome));
      check(importBtn && importBtn.b <= nav.y && importBtn.y >= vp.safe.top, 'import button is visible without scrolling and above the tab bar', JSON.stringify({ importBtn, nav }));
      check(nav && nav.h <= 72 * k && Math.abs(nav.b - (vp.height - ((vp.safe.bottom * 0.6) + 8 * k))) <= 2, `tab bar is compact (${Math.round(nav?.h)}px) and floats above the home indicator`, JSON.stringify(nav));
      check(await page.locator('nav[aria-label="Primary"] a').count() === 3, 'exactly three tabs: Home, Search, Library');
      check(await page.locator('text=Example').count() >= 1 && await page.locator('[aria-label^="Play "]').count() === 0, 'example previews are labelled and contain no playable songs');
      const exTop = await rect(page, 'section[aria-label^="Example"]');
      check(exTop && exTop.b > vp.height * 0.45 || vp.height < 700, 'empty Home fills the screen intentionally (no huge blank area)', JSON.stringify(exTop));
      check(await page.locator('[aria-label="Settings"]').isVisible(), 'settings button is in the Home header');
      await noOverflow(page, '#main', 'empty home');
      const hdrBtns = await page.evaluate(() => [...document.querySelectorAll('header button')].map((b) => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }));
      const word = await rect(page, 'header a[aria-label="Cadence home"]');
      check(word && word.y >= vp.safe.top && !hdrBtns.some((b) => overlap(word, b)), 'wordmark clears the status bar and the header buttons', JSON.stringify({ word, hdrBtns }));

      // ---- Settings in standalone vs browser ----
      await page.click('[aria-label="Settings"]');
      await page.waitForSelector('text=Known iOS limitations');
      await shot(page, '9-settings');
      const tip = await page.locator('text=Add to Home Screen').count();
      check(vp.standalone ? tip === 0 : true, vp.standalone ? 'standalone mode detected: install tip hidden' : 'settings rendered');
      await noOverflow(page, '#main', 'settings');
      await page.click('[aria-label="Back"]');
      await page.waitForSelector('text=Welcome to Cadence');

      // ---- import: audio + lyric sidecar + duplicate ----
      await page.setInputFiles('input[type=file] >> nth=0', IMPORT_ALL);
      await page.waitForSelector('text=Quick Picks >> nth=0', { timeout: 30000 });
      await page.waitForTimeout(600);
      await shot(page, '1-home');
      check(await page.locator('text=Welcome to Cadence').count() === 0, 'welcome card goes away once songs exist');
      const h1 = await rect(page, 'header a[aria-label="Cadence home"]');
      check(h1 && h1.y >= vp.safe.top, 'populated home header clears the status bar');
      await noOverflow(page, '#main', 'home');
      check(await page.locator('main img').count() > 0, 'real artwork is rendered');
      check(await page.locator('[role="group"][aria-label="Moods"] button').count() === 3, 'mood chips appear only for moods backed by real tracks (Energize, Relax, Workout)');
      const quick = await page.locator('h2', { hasText: 'Quick Picks' }).first().boundingBox();
      check(quick && quick.y > 60, 'Quick Picks section is present below the header');
      await page.getByRole('button', { name: /^Relax/ }).click();
      await page.waitForSelector('text=Relax picks');
      check(await page.locator('[aria-label^="Play Slow Lake"], [aria-label^="Play Drift One"], [aria-label^="Play Tide Study"]').count() >= 3, 'mood picks come from matching library tracks');
      await shot(page, '1b-home-mood');
      await page.getByRole('button', { name: /^Relax/ }).click();

      // ---- Library ----
      await page.getByRole('link', { name: 'Library' }).click();
      await page.waitForSelector('text=Ember Lines');
      await page.waitForTimeout(300);
      await shot(page, '2-library-songs');
      await noOverflow(page, '#main', 'library songs');
      const count = await page.locator('[aria-label^="Play "][aria-label*=" by "]').count();
      check(count === 8, `library lists 8 unique songs (duplicate skipped), got ${count}`);
      await page.getByRole('link', { name: 'Albums' }).click();
      await page.waitForSelector('text=Afterglow');
      await page.waitForTimeout(300);
      await shot(page, '3-library-albums');
      await noOverflow(page, '#main', 'library albums');
      await page.getByRole('link', { name: 'Downloads' }).click();
      await page.waitForSelector('text=No licensed downloads yet');
      await page.getByRole('link', { name: 'Songs' }).click();
      await page.getByRole('button', { name: /Sort by/ }).click();
      await page.getByRole('button', { name: 'Duration' }).click();
      await page.getByPlaceholder('Search songs').fill('afterglow');
      await page.waitForTimeout(250);
      check(await page.locator('[aria-label^="Play "][aria-label*=" by "]').count() === 2, 'library search filters by album');
      await page.getByPlaceholder('Search songs').fill('');

      // ---- keyboard: simulate the soft keyboard by shrinking the viewport ----
      await page.getByRole('link', { name: 'Search' }).click();
      await page.getByPlaceholder('Songs, artists, albums').focus();
      await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) });
      await page.waitForTimeout(250);
      const field = await rect(page, 'label:has(input[type=search])');
      check(field && field.y >= 0 && field.b <= vp.height * 0.55, 'search field stays visible with the keyboard up', JSON.stringify(field));
      await shot(page, '10-search-keyboard');
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.getByPlaceholder('Songs, artists, albums').fill('tide');
      await page.waitForSelector('text=Tide Study');
      await noOverflow(page, '#main', 'search');
      await page.getByPlaceholder('Songs, artists, albums').fill('');

      // ---- album detail ----
      await page.getByRole('link', { name: 'Library' }).click();
      await page.getByRole('link', { name: 'Albums' }).click();
      await page.getByText('Afterglow').first().click();
      await page.waitForSelector('text=Play >> nth=0');
      await page.waitForTimeout(400);
      await shot(page, '4-album-detail');
      await noOverflow(page, '#main', 'album detail');
      await page.getByRole('button', { name: 'Back' }).click();

      // ---- playback + mini player ----
      await page.getByRole('link', { name: 'Home' }).click();
      await page.getByRole('button', { name: /^Play Ember Lines/ }).first().click();
      await page.waitForSelector('[aria-label^="Open player"]');
      await page.waitForTimeout(1000);
      await shot(page, '5-home-miniplayer');
      const mini = await rect(page, '[aria-label^="Open player"]');
      const dock = await rect(page, 'nav[aria-label="Primary"] ul');
      check(mini && dock && mini.b <= dock.y + 1, 'mini player sits directly above the tab bar', JSON.stringify({ mini, dock }));
      const gap = dock.y - (await page.evaluate(() => document.querySelector('[aria-label^="Open player"]').closest('.relative').getBoundingClientRect().bottom));
      check(gap >= 0 && gap <= 16, `mini player is within 16px of the tab bar (gap ${Math.round(gap)}px)`);
      check(await page.locator('text=Keep listening').count() === 1, 'Keep listening appears after a song has been played');

      // ---- Now Playing ----
      await page.click('[aria-label^="Open player"]');
      await page.waitForTimeout(800);
      await shot(page, '6-now-playing');
      const hdr = await rect(page, `${P} header`);
      const art = await rect(page, `${P} .shadow-card`);
      const title = await rect(page, `${P} h2`);
      const play = await rect(page, `${P} [aria-label="Pause"]`);
      const seek = await rect(page, `${P} input[type=range]`);
      const pills = await rect(page, `${P} [aria-label="Show queue"]`);
      check(art && title && art.b <= title.y + 2, 'cover is above the title', JSON.stringify({ art, title }));
      check(title && seek && title.b <= seek.y + 2, 'title block is above the progress bar', JSON.stringify({ title, seek }));
      check(seek && play && seek.b <= play.y + 2, 'progress bar is above the controls', JSON.stringify({ seek, play }));
      check(play && pills && play.b <= pills.y + 2, 'controls are above the Queue / Sleep / Lyrics pills', JSON.stringify({ play, pills }));
      check(pills && pills.b <= vp.height - vp.safe.bottom + 1, 'pills clear the home indicator', JSON.stringify({ pills, safe: vp.safe }));
      check(art && art.w >= 140 && art.x >= 0 && art.r <= vp.width, `cover is large and inside the viewport (${Math.round(art?.w ?? 0)}px)`, JSON.stringify(art));
      check(art && hdr && art.y - hdr.b < vp.height * 0.14, 'no large empty gap between header and cover', JSON.stringify({ hdr, art }));
      const radius = await page.evaluate((s) => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).borderTopLeftRadius) : -1; }, `${P} [aria-label="Pause"]`);
      check(play && Math.abs(play.w - play.h) <= 1 && radius > 8 && radius < play.w / 2 - 4, `play/pause is a rounded square (${Math.round(play?.w)}px, radius ${radius}px)`);
      for (const l of ['Shuffle off', 'Previous track', 'Next track', 'Repeat off']) check(await page.locator(`${P} [aria-label="${l}"]`).count() === 1, `control present: ${l}`);
      for (const l of ['Show queue', 'Sleep timer', 'Show lyrics']) check(await page.locator(`${P} [aria-label="${l}"]`).count() === 1, `pill present: ${l}`);
      check(await page.locator(`${P} [aria-label="Add to favorites"]`).count() === 1 && await page.locator(`${P} [aria-label="More actions"]`).count() === 1, 'favorite and overflow buttons beside the title');
      await noOverflow(page, P, 'now playing');
      const t0 = await page.evaluate((s) => document.querySelector(s).value, `${P} input[type=range]`);
      await page.waitForTimeout(1200);
      const t1 = await page.evaluate((s) => document.querySelector(s).value, `${P} input[type=range]`);
      check(Number(t1) > Number(t0), 'playback position advances', `${t0} -> ${t1}`);

      await page.click(`${P} [aria-label="Add to favorites"]`);
      await page.waitForTimeout(300);
      check(await page.locator(`${P} [aria-label="Remove from favorites"]`).count() === 1, 'favorite toggles');
      await page.click(`${P} [aria-label="Shuffle off"]`);
      check(await page.getAttribute(`${P} [aria-label="Shuffle on"]`, 'aria-pressed') === 'true', 'shuffle toggles');
      await page.click(`${P} [aria-label="Shuffle on"]`);
      await page.click(`${P} [aria-label="Repeat off"]`);
      check(await page.locator(`${P} [aria-label="Repeat all"]`).count() === 1, 'repeat cycles');
      await page.click(`${P} [aria-label="Repeat all"]`); // -> repeat one, so the short test clip keeps looping while we inspect lyrics
      check(await page.locator(`${P} [aria-label="Repeat one"]`).count() === 1, 'repeat cycles to one');

      // ---- Sleep timer ----
      await page.click(`${P} [aria-label="Sleep timer"]`);
      await page.getByRole('button', { name: '15 minutes' }).click();
      await page.waitForTimeout(300);
      check(await page.locator(`${P} [aria-label="Sleep timer"]`).innerText().then((t) => /15 min/.test(t)), 'sleep timer pill shows the remaining time');
      await page.click(`${P} [aria-label="Sleep timer"]`);
      await shot(page, '6b-sleep-sheet');
      await page.getByRole('button', { name: 'Off', exact: true }).click();

      // ---- Lyrics (synced, from the .lrc sidecar) ----
      await page.click(`${P} [aria-label="Show lyrics"]`);
      await page.waitForTimeout(1800);
      await shot(page, '7-lyrics');
      const cur = await rect(page, `${P} [aria-current="true"]`);
      const box = await rect(page, `${P} [aria-label="Lyrics"]`);
      check(await page.locator(`${P} [data-line]`).count() === 5, 'synced lyrics from the imported .lrc file are shown');
      check(cur && box && Math.abs((cur.y + cur.h / 2) - (box.y + box.h / 2)) < box.h * 0.22, 'current lyric line is centred in the lyrics view', JSON.stringify({ cur, box }));
      const ops = await page.evaluate((s) => [...document.querySelectorAll(`${s} [data-line] button`)].map((b) => Number(getComputedStyle(b).opacity)), P);
      check(ops.some((o) => o > 0.9) && ops.filter((o) => o < 0.6).length >= 2, 'current line is prominent, others are dimmed', JSON.stringify(ops));
      await noOverflow(page, P, 'lyrics');
      const lp = await rect(page, `${P} [aria-label="Pause"]`);
      check(lp && lp.b <= vp.height - vp.safe.bottom, 'lyrics: playback controls at the bottom clear the home indicator');
      await page.click(`${P} [data-line="4"] button`);
      await page.waitForTimeout(400);
      const seeked = await page.evaluate((s) => Number(document.querySelector(s).value), `${P} input[type=range]`);
      check(seeked >= 3.5, 'tapping a lyric line seeks to it', String(seeked));
      // plain embedded lyrics + empty state
      await page.click(`${P} [aria-label="Next track"]`);
      await page.waitForTimeout(900);
      const which = await page.locator(`${P} header .truncate`).last().innerText();
      await shot(page, '7b-lyrics-next-track');
      const emptyOrPlain = (await page.locator(P).getByText('No lyrics for this track').count()) + (await page.locator(P).getByText('Not time-synced').count());
      check(emptyOrPlain >= 1, `next track (${which}) shows plain lyrics or the empty state, never fake lyrics`);

      // ---- Queue ----
      await page.click(`${P} [aria-label="Show queue"]`);
      await page.waitForTimeout(500);
      await shot(page, '8-queue');
      check(await page.locator(P).getByText(/Up next/).count() === 1, 'queue view opens');
      await noOverflow(page, P, 'queue');
      const tr = await rect(page, `${P} [aria-label="Pause"]`);
      check(tr && tr.b <= vp.height - vp.safe.bottom + 1, 'queue: transport clears the home indicator');
      await page.click(`${P} [aria-label="Hide queue"]`);
      await page.waitForTimeout(300);

      // ---- swipe-down dismiss ----
      await swipeDown(page, `${P} header`);
      await page.waitForTimeout(900);
      check(await page.locator(`${P} [aria-label="Close player"]`).count() === 0, 'swipe down dismisses the player');
      check(await page.locator('[aria-label^="Open player"]').isVisible(), 'mini player is back after dismiss');
      await page.click('[aria-label^="Open player"]');
      await page.waitForTimeout(700);
      check(await page.locator(`${P} [aria-label="Close player"]`).count() === 1, 'player re-opens after a swipe dismiss');
      await page.click(`${P} [aria-label="Close player"]`);
      await page.waitForTimeout(700);

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
        check(await page.locator('[aria-label^="Open player"]').isVisible(), 'track plays offline from IndexedDB');
        await ctx.setOffline(false);
      }
      check(errors.length === 0, 'no console / page errors', errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    if (only && !only.includes('reduced')) { await browser.close(); server.kill(); console.log(failures ? `\n${failures} E2E check(s) FAILED` : '\nSelected E2E checks passed'); process.exit(failures ? 1 : 0); }
    // ---- reduced motion: no view transition, still opens and closes ----
    console.log('\n== reduced motion');
    const { ctx, page, errors } = await newPage(browser, VIEWPORTS[2], { reducedMotion: 'reduce' });
    await page.goto(URL);
    await page.waitForSelector('text=Welcome to Cadence');
    await page.setInputFiles('input[type=file] >> nth=0', AUDIO.slice(0, 3));
    await page.getByRole('button', { name: /^Play Ember Lines/ }).first().click({ timeout: 20000 });
    await page.click('[aria-label^="Open player"]');
    await page.waitForTimeout(200);
    check(await page.locator(`${P} [aria-label="Close player"]`).count() === 1, 'player opens with reduced motion');
    await page.click(`${P} [aria-label="Close player"]`);
    await page.waitForTimeout(200);
    check(await page.locator(`${P} [aria-label="Close player"]`).count() === 0, 'player closes with reduced motion');
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
