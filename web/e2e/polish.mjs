// E2E for the polish pass: toasts, long-press menus, scrubbing, queue drag/swipe/undo, "keep playing similar",
// karaoke + lyric timing, recap card, recap share image, disc dividers, levelling setting.
// Usage: VITE_BASE=/archivetune/ npm run build && node e2e/polish.mjs   [E2E_BASE=/archivetune/] [POLISH_OUT=dir for screenshots]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(process.env.POLISH_OUT ?? 'e2e/screenshots/polish');
const PORT = Number(process.env.POLISH_PORT ?? 4193);
const FX = resolve('e2e/fixtures');
const BASE = process.env.E2E_BASE ?? '/archivetune/';
const URL = `http://localhost:${PORT}${BASE}`;
const P = '[aria-hidden="false"]'; // the open player
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` ${detail}`}`); if (!ok) failed++; };

const srv = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { env: { ...process.env, VITE_BASE: BASE }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 62, bottom: 34, left: 0, right: 0 } }).catch(() => {});
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  const rect = (sel) => page.locator(sel).first().boundingBox();
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const longPress = async (sel) => {
    const b = await rect(sel);
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await touch('touchStart', x, y);
    await page.waitForTimeout(650);
    await touch('touchEnd', x, y);
  };
  const swipe = async (sel, dx, dy = 0) => {
    const b = await rect(sel);
    const x = b.x + b.width * 0.6, y = b.y + b.height / 2;
    await touch('touchStart', x, y);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', x + (dx * i) / 8, y + (dy * i) / 8); await page.waitForTimeout(16); }
    await touch('touchEnd', x + dx, y + dy);
  };

  await page.goto(URL);
  await page.waitForSelector('text=Welcome to Cadence');
  const files = readdirSync(FX).filter((f) => /\.(mp3|lrc)$/.test(f)).map((f) => `${FX}/${f}`);
  await page.setInputFiles('input[type=file] >> nth=0', files);
  await page.waitForSelector('text=Quick Picks', { timeout: 20000 });

  console.log('== recap card and toast');
  check(await page.locator('[aria-label="Open your listening recap"]').count() === 0, 'Home hides the recap card before anything is played');
  const t0 = await rect('[role="status"] [data-toast]');
  const tab = await rect('nav[aria-label="Primary"] ul');
  check(t0 && tab && t0.y + t0.height <= tab.y + 1, 'without a mini-player the toast sits above the tab bar');

  // play the whole library from the Songs tab
  await page.locator('nav[aria-label="Primary"]').getByRole('link', { name: 'Library' }).click();
  await page.waitForTimeout(400);
  await page.locator('main').getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForSelector('[data-miniplayer]');
  await page.waitForTimeout(500);

  console.log('== long-press');
  if (process.env.DBG) { await page.evaluate(() => { for (const ev of ['pointerdown','pointerup','pointercancel','pointerleave','touchstart','touchend','contextmenu','click']) document.addEventListener(ev, (e) => console.warn('EV', ev, e.pointerType ?? '', String(e.target.className).slice(0, 40)), true); }); page.on('console', (m) => { if (m.type() === 'warning') console.log('   ', m.text()); }); }
  await longPress('main .cv-row >> nth=2');
  await page.waitForTimeout(300);
  check(await page.getByRole('button', { name: 'Go to album' }).count() === 1 || await page.getByRole('button', { name: 'Go to artist' }).count() === 1, 'long-press on a song opens its menu with Go to album / artist');
  await shot('1-long-press-song');
  await page.getByRole('button', { name: 'Add to queue' }).click();
  await page.waitForTimeout(150);
  const tm = await rect('[data-miniplayer] [data-toast]');
  const mp = await rect('[data-miniplayer]');
  check(tm && mp && Math.abs(tm.y - mp.y) < 2 && Math.abs(tm.height - mp.height) < 2, 'with a mini-player the toast shows inside it', JSON.stringify({ tm, mp }));
  await shot('2-toast-in-miniplayer');
  await page.waitForTimeout(3000);
  await page.getByRole('link', { name: 'Albums' }).click();
  await page.waitForTimeout(300);
  await longPress('main a[href*="albums/"] >> nth=0');
  await page.waitForTimeout(300);
  check(await page.getByRole('dialog').getByRole('button', { name: 'Shuffle' }).count() === 1, 'long-press on an album opens the album menu');
  await shot('3-long-press-album');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(await page.getByRole('dialog').count() === 0, 'album menu closes');

  console.log('== mini-player swipe');
  const before = await page.locator('[data-miniplayer] .truncate').first().innerText();
  await swipe('[data-miniplayer]', -160);
  await page.waitForTimeout(500);
  const after = await page.locator('[data-miniplayer] .truncate').first().innerText();
  check(before !== after, 'swiping the mini-player left skips to the next song', `${before} -> ${after}`);
  await swipe('[data-miniplayer]', 0, -90);
  await page.waitForTimeout(800);
  check(await page.locator(`${P} [aria-label="Close player"]`).count() === 1, 'dragging the mini-player up opens the player');

  console.log('== scrubbing');
  const bar = await rect(`${P} .seek-wrap`);
  await page.mouse.move(bar.x + bar.width * 0.2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(100);
  check(await page.locator(`${P} .seek-wrap[data-held]`).count() === 1 && await page.locator(`${P} [data-scrub-bubble]`).isVisible(), 'holding the bar grows it and shows the time bubble');
  await page.mouse.move(bar.x + bar.width * 0.25, bar.y + bar.height / 2 + 130, { steps: 6 });
  await page.waitForTimeout(100);
  check(/Quarter-speed/.test(await page.locator(`${P} [data-scrub-bubble]`).innerText()), 'sliding the finger away slows scrubbing');
  await shot('4-scrub');
  await page.mouse.up();
  await page.waitForTimeout(150);
  check(await page.locator(`${P} [data-scrub-bubble]`).count() === 0, 'bubble hides on release');

  console.log('== queue');
  await page.click(`${P} [aria-label="Pause"]`); // the fixtures are a few seconds long: keep the queue still
  await page.click(`${P} [aria-label="Show queue"]`);
  await page.waitForTimeout(500);
  const titles = () => page.locator(`${P} [data-queue-row] .text-body`).allInnerTexts();
  const q0 = await titles();
  const h0 = await rect(`${P} [aria-label^="Reorder"] >> nth=0`);
  const rowH = (await rect(`${P} [data-queue-row] >> nth=0`)).height;
  await page.mouse.move(h0.x + h0.width / 2, h0.y + h0.height / 2);
  await page.mouse.down();
  await page.mouse.move(h0.x + h0.width / 2, h0.y + h0.height / 2 + rowH * 2.1, { steps: 8 });
  await shot('5-queue-drag');
  await page.mouse.up();
  await page.waitForTimeout(300);
  const q1 = await titles();
  check(q1[2] === q0[0] && q1[0] === q0[1], 'dragging the handle moves a song two places down', JSON.stringify({ q0: q0.slice(0, 3), q1: q1.slice(0, 3) }));
  await page.locator(`${P} [aria-label^="Reorder"] >> nth=0`).focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const q2 = await titles();
  check(q2[1] === q1[0], 'the handle also reorders with the arrow keys');
  await swipe(`${P} [data-queue-row] >> nth=0`, -260);
  await page.waitForTimeout(500);
  const q3 = await titles();
  check(q3.length === q2.length - 1 && q3[0] === q2[1], 'swiping a song left removes it');
  check(await page.locator(`${P} [data-toast]`).isVisible(), 'the removal toast shows inside the open player');
  await shot('6-queue-undo');
  await page.locator(`${P} [data-toast]`).getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(300);
  check(JSON.stringify(await titles()) === JSON.stringify(q2), 'Undo puts it back in place');

  console.log('== keep playing similar');
  await page.click(`${P} [aria-label="Close player"]`);
  await page.waitForTimeout(600);
  await page.locator('nav[aria-label="Primary"]').getByRole('link', { name: 'Search' }).click();
  await page.getByPlaceholder('Songs, artists, albums').fill('Ember');
  await page.getByRole('button', { name: /^Play Ember Lines/ }).first().click();
  await page.waitForTimeout(600);
  await page.click('[aria-label^="Open player"]');
  await page.waitForTimeout(700);
  if (!(await page.locator(`${P} [aria-label="Hide queue"]`).count())) await page.click(`${P} [aria-label="Show queue"]`);
  await page.waitForTimeout(400);
  if (await page.locator(`${P} [aria-label="Repeat one"]`).count()) await page.click(`${P} [aria-label="Repeat one"]`);
  if (await page.locator(`${P} [aria-label="Repeat all"]`).count()) { await page.click(`${P} [aria-label="Repeat all"]`); await page.click(`${P} [aria-label="Repeat one"]`); }
  await page.waitForTimeout(300);
  const keep = page.locator(`${P}`).getByRole('button', { name: 'Keep playing similar' });
  check(await keep.count() === 1, 'a lone song offers "Keep playing similar"');
  await shot('7-keep-playing');
  await keep.click();
  await page.waitForTimeout(400);
  check(await page.locator(`${P} [data-queue-row]`).count() >= 1, 'similar songs are queued after it');

  console.log('== lyrics');
  await page.click(`${P} [aria-label="Hide queue"]`);
  await page.click(`${P} [aria-label="Repeat off"]`).catch(() => {});
  await page.click(`${P} [aria-label="Show lyrics"]`);
  await page.waitForTimeout(1200);
  check(await page.locator(`${P} [aria-current="true"] .karaoke`).count() > 0, 'the sung line is lit word by word');
  await shot('8-karaoke');
  await page.click(`${P} [aria-label="Lyrics options"]`);
  await page.waitForTimeout(300);
  check(/Matches the file/.test(await page.locator('[data-lyrics-offset]').innerText()), 'timing starts at the file timing');
  await page.click('[aria-label="Show lyrics half a second later"]');
  await page.waitForTimeout(300);
  check(/0\.5 s later/.test(await page.locator('[data-lyrics-offset]').innerText()), 'timing can be nudged later');
  await shot('9-lyrics-timing');
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.waitForTimeout(200);
  check(/Matches the file/.test(await page.locator('[data-lyrics-offset]').innerText()), 'timing resets');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3500); // past the 3 s listen threshold of the short fixture
  await page.click(`${P} [aria-label="Back to player"]`);
  await page.click(`${P} [aria-label="Close player"]`);
  await page.waitForTimeout(600);

  console.log('== recap');
  await page.goto(`${URL}#/`);
  await page.waitForTimeout(800);
  check(await page.locator('[aria-label="Open your listening recap"]').isVisible(), 'the recap card appears after the first listen');
  await page.goto(`${URL}#/recap`);
  await page.waitForSelector('[data-testid="recap-share"]:not([disabled])', { timeout: 8000 });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('[data-testid="recap-share"]')]);
  check(!!dl, 'Share saves an image where the share sheet cannot take files');
  if (dl) await dl.saveAs(`${OUT}/10-recap-card.png`);
  await shot('11-recap');

  console.log('== disc dividers');
  await page.evaluate(() => new Promise((ok, no) => {
    const r = indexedDB.open('cadence');
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction('tracks', 'readwrite'), st = tx.objectStore('tracks');
      const q = st.getAll();
      q.onsuccess = () => { const t = q.result.find((x) => x.title === 'Ember Lines'); if (t) st.put({ ...t, discNo: 2 }); };
      tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => no(tx.error);
    };
  }));
  await page.goto(`${URL}#/library/albums`);
  await page.reload(); // the write above bypassed the app, so load fresh
  await page.waitForTimeout(800);
  await page.locator('main a[href*="albums/"]', { hasText: 'Afterglow' }).first().click();
  await page.waitForTimeout(600);
  check(await page.locator('main [data-disc]').count() === 2, 'an album over two discs shows Disc 1 and Disc 2');
  await shot('12-discs');

  console.log('== lock-screen artwork');
  await page.goto(`${URL}#/search`);
  await page.getByPlaceholder('Songs, artists, albums').fill('Landscape');
  await page.getByRole('button', { name: /^Play Landscape Cover/ }).first().click();
  await page.waitForTimeout(1200);
  const art = await page.evaluate(async () => {
    const src = navigator.mediaSession?.metadata?.artwork?.[0]?.src;
    if (!src) return null;
    const img = new Image();
    img.src = src;
    await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight };
  });
  check(!!art && art.w === art.h, 'a wide cover reaches the lock screen / Dynamic Island as the same square the app shows', JSON.stringify(art));

  console.log('== lyrics: depth, motion, header, ttml, sync');
  await page.goto(`${URL}#/search`);
  await page.getByPlaceholder('Songs, artists, albums').fill('Ember');
  await page.getByRole('button', { name: /^Play Ember Lines/ }).first().click();
  await page.waitForTimeout(500);
  await page.click('[aria-label^="Open player"]');
  await page.waitForTimeout(700);
  for (const l of ['Hide queue']) if (await page.locator(`${P} [aria-label="${l}"]`).count()) await page.click(`${P} [aria-label="${l}"]`);
  if (!(await page.locator(`${P} [data-lyrics-header]`).count())) await page.click(`${P} [aria-label="Show lyrics"]`);
  await page.waitForSelector(`${P} [aria-current="true"]`, { timeout: 6000 }).catch(() => {});
  check(await page.locator(`${P} [data-lyrics-header] img, ${P} [data-lyrics-header] [class*="aspect-square"]`).count() >= 1 && await page.locator(`${P} [data-lyrics-header] [aria-label="Back to player"]`).count() === 1, 'lyrics header shows the cover, title and a close button');
  const looks = await page.evaluate((sel) => {
    const lines = [...document.querySelectorAll(`${sel} [data-line] button`)];
    const i = lines.findIndex((b) => b.getAttribute('aria-current') === 'true');
    return { i, filters: lines.map((b) => getComputedStyle(b).filter) };
  }, P);
  const far = looks.filters.filter((f, k) => Math.abs(k - looks.i) >= 2 && /blur/.test(f)).length;
  check(looks.i >= 0 && !/blur/.test(looks.filters[looks.i]) && far >= 1, 'lines further from the sung one are blurred, the sung one is sharp', JSON.stringify(looks));
  const moved = await page.evaluate((sel) => new Promise((ok) => {
    const box = document.querySelector(`${sel} [data-kind="synced"]`);
    const seen = new Set();
    const t0 = performance.now();
    const tick = () => {
      box.querySelectorAll('[data-line]').forEach((el, k) => { if (el.getAnimations().length) seen.add(k); });
      if (seen.size >= 3 || performance.now() - t0 > 3000) ok(seen.size); else requestAnimationFrame(tick);
    };
    tick();
  }), P);
  check(moved >= 3, 'when the line changes, the lines spring up one after another', String(moved));
  const lift = await page.evaluate((sel) => new Promise((ok) => {
    let best = 0;
    const t0 = performance.now();
    const tick = () => {
      document.querySelectorAll(`${sel} .karaoke`).forEach((e) => { const m = /translateY\((-?[\d.]+)em\)/.exec(e.style.transform); if (m) best = Math.min(best, Number(m[1])); });
      if (best < -0.02 || performance.now() - t0 > 3000) ok(best); else requestAnimationFrame(tick);
    };
    tick();
  }), P);
  check(lift < -0.02, 'the word being sung lifts slightly', String(lift));
  await shot('18-lyrics-depth');
  const ttml = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0:00.40"><span begin="0:00.40">Imported</span> <span begin="0:00.90">from</span> <span begin="0:01.30">TTML</span></p><p begin="0:02.20">Second line here</p></div></body></tt>`;
  await page.setInputFiles(`${P} input[type=file]`, { name: 'ember.ttml', mimeType: 'application/ttml+xml', buffer: Buffer.from(ttml) });
  await page.waitForTimeout(800);
  check(await page.locator(`${P} [data-line]`).count() === 2 && /Imported from TTML/.test(await page.locator(`${P} [data-kind="synced"]`).innerText()), 'a .ttml file gives word-timed synced lyrics');

  // Tide Study has plain (untimed) lyrics: sync them by tapping
  await page.click(`${P} [aria-label="Back to player"]`);
  await page.click(`${P} [aria-label="Close player"]`);
  await page.waitForTimeout(600);
  await page.getByPlaceholder('Songs, artists, albums').fill('Tide');
  await page.getByRole('button', { name: /^Play Tide Study/ }).first().click();
  await page.waitForTimeout(500);
  await page.click('[aria-label^="Open player"]');
  await page.waitForTimeout(700);
  if (!(await page.locator(`${P} [data-lyrics-header]`).count())) await page.click(`${P} [aria-label="Show lyrics"]`);
  if (!(await page.locator(`${P} [data-plain-lyrics]`).count())) {
    await page.locator(`${P}`).getByRole('button', { name: 'Paste', exact: true }).click();
    await page.getByLabel('Lyrics text').fill('First plain line\nSecond plain line\n\nThird plain line\nFourth plain line');
    await page.getByRole('button', { name: 'Save lyrics' }).click();
  }
  await page.waitForSelector(`${P} [data-plain-lyrics]`, { timeout: 6000 });
  await page.click(`${P} [data-sync-start]`);
  await page.waitForSelector('[data-sync-tap]');
  const total = await page.locator('[data-sync-line]').count();
  await page.getByRole('dialog').getByRole('button', { name: 'From the start' }).click();
  await page.waitForTimeout(300);
  for (let k = 0; k < total; k++) { await page.click('[data-sync-tap]'); await page.waitForTimeout(60); }
  check(await page.locator('[data-sync-tap]').innerText() === 'All lines timed', `tapping through every line times them all (${total} lines)`);
  await shot('19-sync-tool');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(800);
  check(await page.locator(`${P} [data-kind="synced"] [data-line]`).count() === total, 'plain lyrics are now synced to the song');
  await page.click(`${P} [aria-label="Back to player"]`);
  await page.click(`${P} [aria-label="Close player"]`);
  await page.waitForTimeout(600);

  console.log('== look: glass, ambient, glow, marquee');
  check(await page.locator('nav[aria-label="Primary"] ul.glass').count() === 1 && await page.locator('[data-miniplayer].glass').count() === 1, 'tab bar and mini-player use the frosted glass surface');
  const blur = await page.evaluate(() => getComputedStyle(document.querySelector('nav[aria-label="Primary"] ul')).backdropFilter || getComputedStyle(document.querySelector('nav[aria-label="Primary"] ul')).webkitBackdropFilter);
  check(/blur/.test(blur ?? ''), 'the glass really blurs what is behind it', String(blur));
  await page.getByPlaceholder('Songs, artists, albums').fill('A Very Long');
  await page.getByRole('button', { name: /^Play A Very Long/ }).first().click();
  await page.waitForTimeout(600);
  await page.click('[aria-label^="Open player"]');
  await page.waitForTimeout(900);
  if (await page.locator(`${P} [aria-label="Hide queue"]`).count()) await page.click(`${P} [aria-label="Hide queue"]`);
  if (await page.locator(`${P} [aria-label="Hide lyrics"]`).count()) await page.click(`${P} [aria-label="Hide lyrics"]`);
  await page.waitForTimeout(500);
  check(await page.locator(`${P} [data-marquee="moving"]`).count() === 1, 'a title too long for one line scrolls instead of being cut off');
  check(await page.locator(`${P} [data-ambient] .ambient-blob`).count() >= 3, 'Now Playing has the drifting colour background');
  const anim = await page.evaluate((s) => getComputedStyle(document.querySelector(`${s} .ambient-blob`)).animationName, P);
  check(anim !== 'none', 'the background moves', anim);
  const glow = await page.evaluate((s) => getComputedStyle(document.querySelector(`${s} [data-cover]`)).boxShadow, P);
  check(/rgba?\(/.test(glow) && glow !== 'none', 'the cover casts a glow in its own colour', glow.slice(0, 60));
  await shot('14-now-playing-look');
  await page.click(`${P} [aria-label^="Go to The Extraordinarily"]`);
  await page.waitForTimeout(900);
  check(/#\/library\/artists\//.test(page.url()) && await page.locator(`${P}`).count() === 0, 'tapping the artist closes the player and opens the artist', page.url());

  console.log('== album page');
  await page.goto(`${URL}#/library/albums`);
  await page.waitForTimeout(500);
  await page.locator('main a[href*="albums/"]', { hasText: 'Afterglow' }).first().click();
  await page.waitForTimeout(800);
  const hero = await rect('main [data-hero-cover]');
  check(hero && hero.x <= 1 && hero.width >= 400, 'the album cover runs edge to edge', JSON.stringify(hero));
  check(await page.locator('[data-compact-header]').evaluate((e) => getComputedStyle(e).opacity) === '0', 'the compact header is hidden at the top');
  await shot('15-album-top');
  await page.setViewportSize({ width: 402, height: 560 }); // the fixture album is short: give it room to scroll
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('main').scrollTo({ top: 10_000 }));
  await page.waitForTimeout(600);
  check(await page.locator('[data-compact-header]').evaluate((e) => getComputedStyle(e).opacity) === '1', 'scrolling shows the compact header with the title');
  await shot('16-album-scrolled');
  await page.setViewportSize({ width: 402, height: 874 });

  console.log('== crop cover');
  await page.goto(`${URL}#/search`);
  await page.getByPlaceholder('Songs, artists, albums').fill('Landscape');
  await page.waitForTimeout(400);
  await page.locator('main [aria-label^="More actions for Landscape"]').first().click();
  await page.getByRole('button', { name: 'Crop cover' }).click();
  await page.waitForSelector('[data-crop-frame] img', { timeout: 5000 });
  const f = await rect('[data-crop-frame]');
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.down();
  await page.mouse.move(f.x + f.width / 2 + 120, f.y + f.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('slider', { name: 'Zoom' }).fill('1.5');
  await page.waitForTimeout(200);
  await shot('17-crop');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(1200);
  const editRow = await page.evaluate(() => new Promise((ok) => { const r = indexedDB.open('cadence'); r.onsuccess = () => { const q = r.result.transaction('artEdits').objectStore('artEdits').getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.filter((e) => e.kind === 'manual').map((e) => e.rect)); }; }; }));
  check(editRow.length === 1 && editRow[0].w === editRow[0].h && editRow[0].x < 280, 'Crop cover saves the chosen square (dragged left of centre, zoomed in)', JSON.stringify(editRow));
  check(await page.getByRole('dialog').count() === 0, 'the crop sheet closes after saving');

  console.log('== name clean-up');
  await page.evaluate(() => new Promise((ok, no) => {
    const r = indexedDB.open('cadence');
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction('tracks', 'readwrite'), st = tx.objectStore('tracks');
      const q = st.getAll();
      q.onsuccess = () => { const t = q.result.find((x) => x.title === 'Tide Study'); if (t) st.put({ ...t, title: 'Nova Vale - Tide Study (Official Video)', artist: 'Nova Vale - Topic' }); };
      tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => no(tx.error);
    };
  }));
  await page.goto(`${URL}#/library/songs`);
  await page.reload();
  await page.waitForTimeout(800);
  const listText = await page.locator('main').innerText();
  check(/Tide Study/.test(listText) && !/Official Video|- Topic/.test(listText), 'songs show without "- Topic" and "(Official Video)"');
  await page.getByRole('button', { name: /^Play Tide Study/ }).first().click();
  await page.waitForTimeout(800);
  const meta = await page.evaluate(() => ({ title: navigator.mediaSession?.metadata?.title, artist: navigator.mediaSession?.metadata?.artist }));
  check(meta.title === 'Tide Study' && meta.artist === 'Nova Vale', 'the lock screen gets the clean names too', JSON.stringify(meta));

  console.log('== listening patterns');
  await page.evaluate(() => new Promise((ok, no) => {
    const r = indexedDB.open('cadence');
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction(['tracks', 'plays'], 'readwrite');
      const q = tx.objectStore('tracks').getAll();
      q.onsuccess = () => {
        const pick = q.result.filter((t) => ['Drift One', 'Neon Run', 'Pulse Grid'].includes(t.title));
        const now = Date.now(), day = 86400000;
        // the same hour as now, on earlier days: these songs "belong" to this part of the day
        for (const t of pick) for (const d of [1, 2, 3, 5]) tx.objectStore('plays').add({ trackId: t.id, at: now - d * day, seconds: 180, title: t.title, artist: t.artist, album: t.album });
      };
      tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => no(tx.error);
    };
  }));
  await page.goto(`${URL}#/`);
  await page.reload();
  await page.waitForTimeout(1200);
  const slotSection = page.locator('main [data-slot]');
  check(await slotSection.count() === 1, 'Home offers what you usually play at this time of day');
  const slotTitles = await page.locator('main section').filter({ has: page.locator('[data-slot]') }).innerText();
  check(['Drift One', 'Neon Run', 'Pulse Grid'].every((t) => slotTitles.includes(t)), 'with the songs you played at this hour', slotTitles.slice(0, 120));
  await shot('20-home-slot');
  await page.locator('main section').filter({ has: page.locator('[data-slot]') }).locator('[aria-label^="Play Neon Run"]').first().click({ button: 'right' });
  await page.waitForTimeout(400);
  check(/^Usually (in the|at) /.test(await page.locator('[data-habit]').innerText().catch(() => '')), 'a song\'s menu says when you usually play it');
  await page.keyboard.press('Escape');
  await page.goto(`${URL}#/recap`);
  await page.waitForSelector('[data-testid="recap-rhythm"]', { timeout: 6000 }).catch(() => {});
  check(/Your rhythm/i.test(await page.locator('[data-testid="recap-rhythm"]').innerText().catch(() => '')), 'the recap shows how your listening falls over the day');
  await page.locator('[data-testid="recap-rhythm"]').scrollIntoViewIfNeeded();
  await shot('21-recap-rhythm');

  console.log('== settings');
  await page.goto(`${URL}#/settings`);
  await page.waitForTimeout(500);
  await page.getByRole('radio', { name: 'Track' }).click();
  check(await page.getByRole('radio', { name: 'Track' }).getAttribute('aria-checked') === 'true', 'volume levelling can be switched on where volume is settable');
  await page.getByRole('radio', { name: 'Off' }).click();
  await page.getByRole('radio', { name: 'Off' }).scrollIntoViewIfNeeded();
  await shot('13-settings-playback');

  check(errors.length === 0, 'no console / page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
  failed++;
  console.log('  FAIL', String(e).split('\n')[0]);
  await browser.contexts()[0]?.pages()[0]?.screenshot({ path: `${OUT}/error.png` }).catch(() => {});
} finally { await browser.close(); srv.kill(); }
console.log(failed ? `\n${failed} polish check(s) FAILED` : '\nall polish checks passed');
process.exit(failed ? 1 : 0);
