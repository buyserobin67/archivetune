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
const AUDIO = ['ember.mp3', 'tide.mp3', 'fern.mp3', 'extra0.mp3', 'extra1.mp3', 'extra2.mp3', 'extra3.mp3', 'tone-a.wav', 'art-transparent.mp3', 'art-pillarbox.mp3', 'art-landscape.mp3', 'art-letterbox.mp3', 'art-portrait.mp3'].map((f) => `${FX}/${f}`);
const IMPORT_ALL = [...AUDIO, `${FX}/ember.lrc`, `${FX}/tide.txt`, `${FX}/ember.mp3`]; // + lyric sidecars (synced .lrc, plain .txt with metadata header) + a duplicate

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
      check(count === 13, `library lists 13 unique songs (duplicate skipped), got ${count}`);
      const catRow = page.locator('nav[aria-label="Library sections"] a');
      check(await catRow.count() === 5, 'library has one compact category row (Songs, Albums, Artists, Playlists, Downloads)');
      check(await page.getByRole('button', { name: 'Favorites', exact: true }).count() === 0, 'no favorites chip cluttering the library (it lives in the menu)');
      const playBtn = await rect(page, '[aria-label="Play"]');
      check(playBtn && playBtn.h <= 36 * (vp.textScale ?? 1) + 1, `library Play/Shuffle are small (${Math.round(playBtn?.h ?? 0)}px)`);
      await page.getByRole('link', { name: 'Albums' }).click();
      await page.waitForSelector('text=Afterglow');
      await page.waitForTimeout(300);
      await shot(page, '3-library-albums');
      await noOverflow(page, '#main', 'library albums');
      await page.getByRole('link', { name: 'Downloads' }).click();
      await page.waitForSelector('text=No licensed downloads yet');
      await page.getByRole('link', { name: 'Songs' }).click();
      await page.getByRole('button', { name: 'Sort and filter' }).click();
      await page.getByRole('button', { name: 'Duration' }).click();
      await page.getByRole('button', { name: 'Favorites only' }).click();
      check(page.url().includes('/library/favorites'), 'favorites filter lives in the sort & filter menu');
      await page.getByRole('button', { name: 'Sort and filter' }).click();
      await page.getByRole('button', { name: 'Favorites only' }).click();
      check(page.url().includes('/library/songs'), 'favorites filter toggles back off');
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
      await page.locator('nav[aria-label="Primary"]').getByRole('link', { name: 'Library' }).click();
      await page.getByRole('button', { name: /^Play Ember Lines/ }).first().click();
      await page.locator('nav[aria-label="Primary"]').getByRole('link', { name: 'Home' }).click();
      await page.waitForSelector('[aria-label^="Open player"]');
      await page.waitForTimeout(1000);
      await shot(page, '5-home-miniplayer');
      const mini = await rect(page, '[aria-label^="Open player"]');
      const dock = await rect(page, 'nav[aria-label="Primary"] ul');
      check(mini && dock && mini.b <= dock.y + 1, 'mini player sits directly above the tab bar', JSON.stringify({ mini, dock }));
      const gap = dock.y - (await page.evaluate(() => document.querySelector('[aria-label^="Open player"]').closest('.relative').getBoundingClientRect().bottom));
      check(gap >= 0 && gap <= 16, `mini player is within 16px of the tab bar (gap ${Math.round(gap)}px)`);
      const miniBox = await page.evaluate(() => document.querySelector('[aria-label^="Open player"]').closest('.relative').getBoundingClientRect().height);
      check(miniBox <= 56 * (vp.textScale ?? 1) + 2, `mini player is compact (${Math.round(miniBox)}px)`);
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
      check(art && art.w <= 320 * (vp.textScale ?? 1) + 1, `cover has a sensible maximum size (${Math.round(art?.w ?? 0)}px)`, JSON.stringify(art));
      check(art && hdr && art.y - hdr.b < vp.height * 0.22, 'cover sits close under the header (no giant gap)', JSON.stringify({ hdr, art }));
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
      // Line opacity animates (420ms) and the clip loops, so poll until a settled state appears instead of sampling once.
      const settled = await page.waitForFunction((sel) => {
        const ops = [...document.querySelectorAll(`${sel} [data-line] button`)].map((b) => Number(getComputedStyle(b).opacity));
        return ops.some((o) => o > 0.97) && ops.filter((o) => o < 0.6).length >= 2;
      }, P, { timeout: 4000, polling: 50 }).then(() => true, () => false);
      check(settled, 'current line is prominent, others are dimmed');
      await noOverflow(page, P, 'lyrics');
      const lp = await rect(page, `${P} [aria-label="Pause"]`);
      check(lp && lp.b <= vp.height - vp.safe.bottom, 'lyrics: playback controls at the bottom clear the home indicator');
      await page.click(`${P} [data-line="4"] button`);
      await page.waitForTimeout(400);
      const seeked = await page.evaluate((s) => Number(document.querySelector(s).value), `${P} input[type=range]`);
      check(seeked >= 3.5, 'tapping a lyric line seeks to it', String(seeked));
      // reduced motion: the active line stops animating
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(400);
      const dur = await page.evaluate((s) => getComputedStyle(document.querySelector(`${s} [data-line] button`)).transitionDuration, P);
      check(parseFloat(dur) <= 0.001, 'reduced motion: lyric lines do not animate', dur);
      await page.emulateMedia({ reducedMotion: 'no-preference' });

      // ---- Lyrics (plain .txt with a metadata header): clean, evenly readable, scrolls on its own ----
      for (let n = 0; n < 12; n++) {
        const nowTitle = await page.locator(`${P} header .truncate`).last().innerText();
        if (/Tide Study/.test(nowTitle)) break;
        await page.click(`${P} [aria-label="Next track"]`);
        await page.waitForTimeout(500);
      }
      await page.waitForSelector(`${P} [data-plain-lyrics]`, { timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(500);
      await shot(page, '7c-lyrics-plain');
      const plainText = await page.locator(`${P} [data-plain-lyrics]`).innerText().catch(() => '');
      check(plainText.length > 200, 'plain .txt lyrics are shown', plainText.slice(0, 80));
      check(!/Title:|Artist:|Album:|={5,}|Written by/.test(plainText), 'metadata header, separators and credits are not shown as lyrics', plainText.slice(0, 120));
      check((plainText.match(/Verse 1, line one/g) || []).length === 1 && /Hold on\.\.\.\nHold on\.\.\./.test(plainText.replace(/\n+/g, '\n')), 'real lines and repeated lines are kept');
      const plain = await page.evaluate((s) => {
        const box = document.querySelector(`${s} [data-kind="plain"]`);
        const ps = [...box.querySelectorAll('[data-plain-lyrics] p')].slice(1);
        const cs = ps.map((p) => getComputedStyle(p));
        const bt = box.getBoundingClientRect();
        return { weights: [...new Set(cs.map((c) => c.fontWeight))], colors: [...new Set(cs.map((c) => c.color))], opacities: [...new Set(cs.map((c) => c.opacity))], lh: parseFloat(cs[0].lineHeight) / parseFloat(cs[0].fontSize), scrollable: box.scrollHeight > box.clientHeight + 40, boxTop: bt.top };
      }, P);
      check(plain.weights.length === 1 && Number(plain.weights[0]) === 500, 'unsynced lyrics use medium weight', JSON.stringify(plain.weights));
      check(plain.colors.length === 1 && plain.opacities.length === 1 && plain.opacities[0] === '1', 'every unsynced line is equally readable (same colour, no fading)', JSON.stringify(plain));
      check(plain.lh >= 1.5, `comfortable line spacing (${plain.lh.toFixed(2)})`);
      check(plain.scrollable, 'the lyrics area scrolls on its own');
      const before = await page.evaluate((s) => Math.round(document.querySelector(`${s} [data-kind="plain"]`).scrollTop), P);
      await page.evaluate((s) => { const b = document.querySelector(`${s} [data-kind="plain"]`); b.scrollTop = 400; }, P);
      await page.waitForTimeout(1200);
      const ops1 = await page.evaluate((s) => [...document.querySelectorAll(`${s} [data-plain-lyrics] p`)].map((p) => getComputedStyle(p).opacity).join(), P);
      await page.waitForTimeout(1500); // playback keeps going: nothing about the lines may change
      const after = await page.evaluate((s) => Math.round(document.querySelector(`${s} [data-kind="plain"]`).scrollTop), P);
      const ops2 = await page.evaluate((s) => [...document.querySelectorAll(`${s} [data-plain-lyrics] p`)].map((p) => getComputedStyle(p).opacity).join(), P);
      check(before === 0 && after === 400 && ops1 === ops2, 'unsynced lyrics are not moved or faded by playback; manual scrolling sticks', JSON.stringify({ before, after }));
      await noOverflow(page, P, 'plain lyrics (long line wraps)');
      // bottom of the lyrics is reachable and not hidden behind the playback controls
      await page.evaluate((s) => { const b = document.querySelector(`${s} [data-kind="plain"]`); b.scrollTop = b.scrollHeight; }, P);
      await page.waitForTimeout(300);
      const endGeo = await page.evaluate((s) => {
        const box = document.querySelector(`${s} [data-kind="plain"]`), r = box.getBoundingClientRect();
        const ps = box.querySelectorAll('[data-plain-lyrics] p'); const last = ps[ps.length - 1].getBoundingClientRect();
        const ctl = document.querySelector(`${s} [aria-label="Pause"], ${s} [aria-label="Play"]`).getBoundingClientRect();
        return { lastBottom: last.bottom, boxBottom: r.bottom, ctlTop: ctl.top };
      }, P);
      check(endGeo.lastBottom <= endGeo.boxBottom + 1 && endGeo.boxBottom <= endGeo.ctlTop + 1, 'last lyric line ends above the playback controls', JSON.stringify(endGeo));
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
      check(await page.locator(P).getByRole('heading', { name: /Up next/ }).count() === 1, 'queue view opens');
      check(await page.locator(`${P} section[aria-label="Now playing"]`).count() === 1, 'queue shows the current song in its own Now playing section');
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

      // ---- artwork: square, landscape, pillarboxed, letterboxed (flat bars) and transparent-bar covers ----
      if (vp.name === 'iphone-390x844' || vp.name === 'standalone-402x874') {
        const BG = [36, 38, 41]; // --surface-2: the card colour that shows through transparent pixels
        const bgShare = async (title) => {
          const card = page.locator('main a[href*="albums/"]', { hasText: title }).locator('.aspect-square').first();
          await card.evaluate((el) => el.scrollIntoView({ block: 'center' })); // keep it clear of the floating dock
          await card.locator('img').first().evaluate((img) => img.decode().catch(() => {}));
          await page.waitForTimeout(450); // lazy load + 260ms fade-in
          const buf = await card.screenshot();
          if (process.env.E2E_DEBUG_ART) await card.screenshot({ path: `${OUT}/${vp.name}/art-${title.replace(/ /g, '-')}.png` });
          return page.evaluate(async ([b64, bg]) => {
            const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
            const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
            const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height).data;
            const mx = Math.round(c.width * 0.12), my = Math.round(c.height * 0.12); // skip rounded corners and the ring
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
        await page.waitForTimeout(2200); // background trim pass
        await shot(page, '13-albums-artwork');
        check(await bgShare('Art Test A') < 0.02, 'pillarboxed 16:9 cover fills the square (no bars)');
        check(await bgShare('Art Test B') < 0.02, 'landscape cover fills the square (no bars)');
        check(await bgShare('Art Test D') < 0.02, 'portrait cover fills the square (no bars)');
        const eShare = await bgShare('Art Test E');
        const eNat = await page.evaluate(() => { const a = [...document.querySelectorAll('main a[href*="albums/"]')].find((x) => x.innerText.includes('Art Test E')); const i = a?.querySelector('img'); return i ? `${i.naturalWidth}x${i.naturalHeight} ${i.currentSrc.slice(0, 30)} complete=${i.complete}` : 'no img'; });
        const edits = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('cadence'); r.onsuccess = () => { r.result.transaction('artEdits').objectStore('artEdits').getAll().onsuccess = (e) => res(e.target.result.map((x) => `${x.kind}:${!!x.blob}:${x.disabled ? 'off' : 'on'}`).join(',')); }; }));
        check(eShare < 0.02, 'cover with transparent bars is trimmed automatically (no bars)', `share=${eShare} img=${eNat} edits=${edits}`);
        const flatBefore = await bgShare('Art Test C');
        check(flatBefore > 0.2, `opaque flat letterbox is NOT touched automatically (${Math.round(flatBefore * 100)}% bars)`);

        // diagnostics: report what is inside each image, and what the renderer does with it
        await page.goto(`${URL}#/settings`);
        await page.getByRole('button', { name: 'Scan artwork' }).click();
        await page.waitForSelector('ul[aria-label="Artwork scan results"] li');
        await page.waitForTimeout(500);
        const rows = await page.locator('ul[aria-label="Artwork scan results"] li').allInnerTexts();
        const rowOf = (t) => rows.find((r) => r.includes(t)) ?? '';
        check(/480×480.*PNG.*alpha, \d+% transparent/s.test(rowOf('Transparent Bars')) && /Transparent border: \d+px top, \d+px bottom/.test(rowOf('Transparent Bars')), 'diagnostics: transparent bars are reported with real size, alpha share and border thickness', rowOf('Transparent Bars'));
        check(/Flat #242629 border/.test(rowOf('Letterboxed Cover')), 'diagnostics: flat letterbox is reported with its colour', rowOf('Letterboxed Cover'));
        check(/no borders/.test(rowOf('Landscape Cover')) && /640×360/.test(rowOf('Landscape Cover')), 'diagnostics: landscape image reported as such, not as a defect', rowOf('Landscape Cover'));
        check(rows.length >= 10 && rows.every((r) => /Render check: OK/.test(r)), `render check passes for all ${rows.length} covers (rendering is not the problem)`, rows.filter((r) => !/Render check: OK/.test(r)).join(' / '));
        await shot(page, '14-artwork-diagnostics');
        await page.locator('ul[aria-label="Artwork scan results"] li', { hasText: 'Letterboxed Cover' }).getByRole('button', { name: 'Trim' }).click();
        await page.waitForSelector('ul[aria-label="Artwork scan results"] li:has-text("Letterboxed Cover") button:has-text("Use original")');
        await page.goto(`${URL}#/library/albums`);
        await page.waitForSelector('text=Art Test C');
        await page.waitForTimeout(600);
        check(await bgShare('Art Test C') < 0.02, 'manual trim removes flat letterbox bars');
        // undo: the original bytes come back and so do the bars (this is the user's reported look)
        await page.goto(`${URL}#/settings`);
        await page.getByRole('button', { name: 'Scan artwork' }).click();
        await page.waitForSelector('ul[aria-label="Artwork scan results"] li');
        await page.locator('ul[aria-label="Artwork scan results"] li', { hasText: 'Transparent Bars' }).getByRole('button', { name: 'Use original' }).click();
        await page.waitForTimeout(600);
        await page.goto(`${URL}#/library/albums`);
        await page.waitForSelector('text=Art Test E');
        await page.waitForTimeout(600);
        const bars = await bgShare('Art Test E');
        check(bars > 0.2, `"Use original" restores the untouched image, bars included (${Math.round(bars * 100)}% bars): the bars are in the file`);
        await shot(page, '15-artwork-original-restored');
        await page.goto(`${URL}#/settings`);
        await page.getByRole('button', { name: 'Scan artwork' }).click();
        await page.waitForSelector('ul[aria-label="Artwork scan results"] li');
        await page.locator('ul[aria-label="Artwork scan results"] li', { hasText: 'Transparent Bars' }).getByRole('button', { name: 'Trim' }).click();
        await page.waitForTimeout(600);
        await page.goto(`${URL}#/library/albums`);
        await page.waitForSelector('text=Art Test E');
        await page.waitForTimeout(600);
        check(await bgShare('Art Test E') < 0.02, 'trimming again after undo works');
        await page.goto(`${URL}#/`);

        // queue: a single song is current only, never also "up next"; repeat modes explained
        await page.goto(`${URL}#/search`);
        await page.getByPlaceholder('Songs, artists, albums').fill('Pillarboxed');
        await page.getByRole('button', { name: /^Play Pillarboxed Cover/ }).first().click();
        await page.waitForTimeout(600);
        await page.click('[aria-label^="Open player"]');
        await page.waitForTimeout(700);
        await page.click(`${P} [aria-label="Show queue"]`);
        await page.waitForTimeout(400);
        const state = async () => ({
          removeButtons: await page.locator(`${P} [aria-label^="Remove "]`).count(),
          text: await page.locator(P).innerText(),
        });
        let st = await state();
        const rep = await page.locator(`${P} [aria-label^="Repeat"]`).getAttribute('aria-label');
        if (rep === 'Repeat one') { await page.click(`${P} [aria-label="Repeat one"]`); st = await state(); }
        check(st.removeButtons === 0 && /Nothing queued after this song/.test(st.text), 'single-song queue: nothing under "Up next", current song not repeated there');
        await shot(page, '6c-queue-single');
        await page.click(`${P} [aria-label="Repeat off"]`);
        st = await state();
        check(st.removeButtons === 0 && /Repeat is on/.test(st.text), 'single song + repeat all: explained, still not listed as up next');
        await page.click(`${P} [aria-label="Repeat all"]`);
        st = await state();
        check(st.removeButtons === 0 && /Repeating/.test(st.text), 'single song + repeat one: explained, not listed as up next');
        await page.click(`${P} [aria-label="Repeat one"]`); // back to off
        await page.click(`${P} [aria-label="Close player"]`);
        await page.waitForTimeout(500);
      }

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
