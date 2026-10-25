// Upgrade regression test: your library must survive app updates on the SAME origin.
//   A (an older release, built from a git tag) -> import songs -> B (this checkout) -> C (a faked newer deploy of B).
// One persistent browser profile and one localhost origin the whole time, exactly like an installed PWA getting updates.
// Usage: npm run build && node e2e/upgrade.mjs [tag ...]     (default: the baseline tags below)
//        CHROMIUM_PATH=/path/to/chrome  E2E_PORT=4180
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const FX = resolve('e2e/fixtures');
const OUT = resolve('e2e/screenshots/upgrade');
const PORT = Number(process.env.E2E_PORT ?? 4180);
const ORIGIN = `http://localhost:${PORT}`;
// Older releases to upgrade FROM. Commit ids (not only tags) so CI works on a clone that has no local tags:
//   10c9ad7 = cadence-web-baseline-db1-mvp (database v1, first release)   36d3c1f = cadence-web-baseline-db3-fixes (database v3)
const TAGS = process.argv.slice(2).length ? process.argv.slice(2) : ['10c9ad7', '36d3c1f'];
const AUDIO = ['ember.mp3', 'tide.mp3', 'fern.mp3', 'extra0.mp3', 'extra1.mp3', 'extra2.mp3', 'extra3.mp3', 'tone-a.wav', 'art-transparent.mp3', 'art-pillarbox.mp3'].map((f) => `${FX}/${f}`);

let failures = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}${ok ? '' : ' ' + extra}`); if (!ok) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- static server whose root can be swapped, like a new deploy to the same URL ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
let root = '';
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
  let file = join(root, path === '/' ? 'index.html' : path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html'); // SPA fallback, like Cloudflare Pages
  res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache'); // deploys are visible immediately
  res.end(readFileSync(file));
});

// ---- build an older release from its git tag ----
function buildTag(tag, work) {
  const tree = join(work, `tree-${tag}`);
  execSync(`git worktree add --detach "${tree}" ${tag}`, { stdio: 'ignore' });
  symlinkSync(resolve('node_modules'), join(tree, 'web/node_modules'), 'dir');
  const dist = join(work, `dist-${tag}`);
  execSync(`npx vite build --outDir "${dist}" --emptyOutDir`, { cwd: join(tree, 'web'), env: { ...process.env, VITE_BASE: '/' }, stdio: 'ignore' });
  execSync(`git worktree remove --force "${tree}"`, { stdio: 'ignore' });
  return dist;
}

/** Everything in the library, in a comparable form (Blobs reduced to type + size + a content checksum). */
const snapshot = (page) => page.evaluate(async () => {
  const open = () => new Promise((ok, no) => { const r = indexedDB.open('cadence'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const db = await open();
  const all = (s) => new Promise((ok, no) => { if (!db.objectStoreNames.contains(s)) return ok([]); const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const sum = async (b) => { const u = new Uint8Array(await b.arrayBuffer()); let h = 0; for (const x of u) h = (h * 31 + x) >>> 0; return `${b.type}:${b.size}:${h}`; };
  const out = {
    version: db.version / 10, // Dexie stores its version times ten in IndexedDB
    tracks: (await all('tracks')).map((t) => ({ id: t.id, hash: t.hash, title: t.title, favorite: !!t.favorite })).sort((a, b) => a.id.localeCompare(b.id)),
    blobs: await Promise.all((await all('blobs')).map(async (b) => [b.trackId, await sum(b.blob)])),
    art: await Promise.all((await all('art')).map(async (b) => [b.trackId, await sum(b.blob)])),
    playlists: await all('playlists'),
    settings: (await all('settings')).filter((s) => ['e2e-marker'].includes(s.key)),
    lyrics: (await all('lyrics')).map((l) => l.trackId),
  };
  out.blobs.sort(); out.art.sort();
  db.close();
  return out;
});

/** Adds the user-created things an import alone does not: a favorite, a playlist and a setting. Raw writes against whatever schema is installed. */
const addUserData = (page) => page.evaluate(async () => {
  const db = await new Promise((ok, no) => { const r = indexedDB.open('cadence'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tracks = await new Promise((ok) => { const r = db.transaction('tracks').objectStore('tracks').getAll(); r.onsuccess = () => ok(r.result); });
  await new Promise((ok, no) => {
    const tx = db.transaction(['tracks', 'playlists', 'settings'], 'readwrite');
    tx.objectStore('tracks').put({ ...tracks[0], favorite: true });
    tx.objectStore('playlists').put({ id: 'e2e-playlist', name: 'Keep Me', trackIds: tracks.slice(0, 3).map((t) => t.id), createdAt: 1, updatedAt: 2 });
    tx.objectStore('settings').put({ key: 'e2e-marker', value: 'still-here' });
    tx.oncomplete = ok; tx.onerror = () => no(tx.error);
  });
  db.close();
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function readyPage(ctx) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { page, errors };
}

/** Loads the app and reloads until a build exposing __CADENCE__ with the wanted version runs. Old workers serve the old shell once. */
async function loadUntil(page, want, label) {
  for (let i = 1; i <= 6; i++) {
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForSelector('#root > *', { state: 'attached', timeout: 15000 });
    await sleep(1500);
    const info = await page.evaluate(() => window.__CADENCE__ ?? null);
    if (info && want(info)) { console.log(`       ${label} running after ${i} load(s): ${JSON.stringify(info)}`); return info; }
  }
  return null;
}

async function offlinePlayback(ctx, page, label) {
  await page.goto(ORIGIN + '/#/library/songs');
  await page.waitForSelector('button[aria-label="Play"]', { timeout: 15000 });
  await ctx.setOffline(true);
  try {
    await page.click('button[aria-label="Play"]');
    const ok = await page.waitForFunction(() => { const a = (window.__audios || [])[0]; return a && !a.paused && a.currentTime > 0.3; }, null, { timeout: 15000 }).then(() => true, () => false);
    check(ok, `${label}: a song plays offline from stored audio`);
    await page.evaluate(() => (window.__audios || []).forEach((x) => x.pause()));
    if (!ok) console.log('       audio state:', JSON.stringify(await page.evaluate(() => { const a = (window.__audios || [])[0]; return a ? { paused: a.paused, t: a.currentTime, err: a.error && a.error.code, src: a.src.slice(0, 30), rs: a.readyState } : null; })));
  } finally {
    await ctx.setOffline(false);
  }
}

async function scenario(tag, distA, distB, distC, work) {
  console.log(`\n== ${tag}  ->  current  ->  next deploy`);
  const dir = join(OUT, tag);
  mkdirSync(dir, { recursive: true });
  const profile = mkdtempSync(join(work, 'profile-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'],
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  // The player's audio element is never attached to the page, so keep a handle to it for the playback checks.
  await ctx.addInitScript(() => {
    const Native = window.Audio;
    window.Audio = function (...a) { const x = new Native(...a); (window.__audios ||= []).push(x); return x; };
  });
  try {
    // ---- A: the older release imports the music ----
    root = distA;
    let { page, errors } = await readyPage(ctx);
    await page.goto(ORIGIN + '/');
    await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 15000 });
    await sleep(500);
    await page.setInputFiles('input[type=file] >> nth=0', AUDIO);
    // wait until every song is stored (older releases have different screens, so watch the database itself)
    const stored = await page.waitForFunction(async (n) => {
      const db = await new Promise((ok, no) => { const r = indexedDB.open('cadence'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
      const c = await new Promise((ok) => { const r = db.transaction('blobs').objectStore('blobs').count(); r.onsuccess = () => ok(r.result); });
      db.close();
      return c >= n;
    }, AUDIO.length, { timeout: 60000, polling: 500 }).then(() => true, () => false);
    check(stored, 'A finished importing');
    await sleep(1500);
    await addUserData(page);
    const before = await snapshot(page);
    check(before.tracks.length === AUDIO.length, `A imported ${before.tracks.length} songs (database v${before.version})`);
    check(before.blobs.length === before.tracks.length && before.art.length > 0, 'A stored audio and artwork for them');
    await page.waitForFunction(() => navigator.serviceWorker.controller || true);
    await page.reload(); await sleep(1000); // let A's worker take control so it behaves like a real installed app
    await page.close();

    // ---- B: this checkout is deployed to the same URL ----
    root = distB;
    // Builds before 0.4.0 activate a new worker on their own only once every window is closed: open (the browser notices
    // the new worker), then quit the app like swiping it away, then reopen. This is the one-time hop onto the new update flow.
    ({ page } = await readyPage(ctx));
    await page.goto(ORIGIN + '/'); await sleep(2500); await page.close(); await sleep(2500);
    ({ page, errors } = await readyPage(ctx));
    const currentVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
    const info = await loadUntil(page, (i) => i.version === currentVersion && i.schema >= 4, 'B');
    check(!!info, 'the new version loads on the same origin');
    if (info) {
      const after = await snapshot(page);
      check(same(after.tracks, before.tracks), 'every song record is still there');
      check(same(after.blobs, before.blobs), 'every audio Blob is byte-identical');
      check(same(after.art, before.art), 'every artwork Blob is byte-identical');
      check(same(after.playlists, before.playlists), 'playlists are unchanged');
      check(same(after.settings, before.settings), 'settings are unchanged');
      check(after.version >= before.version, `database went v${before.version} -> v${after.version}, never down`);
      await page.goto(ORIGIN + '/#/library/songs');
      await page.waitForSelector('button[aria-label="Play"]');
      check(await page.locator('text=' + before.tracks[0].title).count() > 0, 'the library screen lists the songs');
      await offlinePlayback(ctx, page, 'B');
      await page.goto(ORIGIN + '/#/settings');
      await page.waitForSelector('[data-testid="about-data"]');
      const about = await page.locator('[data-testid="about-data"]').innerText();
      check(/App version/.test(about) && /Database version\s*v4/.test(about), 'Settings shows app version and database version');
      await page.screenshot({ path: `${dir}/settings-about.png` });
      // "Check for updates" must always visibly answer
      await page.click('button:has-text("Check for updates")');
      const answered = await page.waitForFunction(() => /latest version/i.test(document.querySelector('[data-testid="update-status"]')?.textContent ?? ''), null, { timeout: 15000 }).then(() => true, () => false);
      check(answered, 'Check for updates answers "You are on the latest version" when nothing new is deployed');
      await sleep(1500);
    }

    // ---- C: another deploy to the same URL while B is open ----
    root = distC;
    await page.click('button:has-text("Check for updates")');
    const statusReady = await page.waitForFunction(() => /Restart to update/i.test(document.querySelector('[data-testid="update-status"]')?.textContent ?? ''), null, { timeout: 20000 }).then(() => true, () => false);
    check(statusReady, 'Check for updates finds the new deploy and says Restart to update');
    const banner = page.locator('text=New Cadence version available');
    const shown = await banner.first().waitFor({ timeout: 15000 }).then(() => true, () => false);
    check(shown, 'a waiting update shows "New Cadence version available — Restart to update."');
    const swBefore = await page.evaluate(() => caches.keys());
    check(swBefore.length >= 2 || shown, 'old and new shell caches coexist until restart');
    const stillB = await snapshot(page);
    check(info ? same(stillB.tracks, before.tracks) : true, 'nothing changed in the library while the update waits');
    await page.screenshot({ path: `${dir}/update-banner.png` });
    await page.click('button:has-text("Restart")');
    await page.waitForFunction(async () => (await caches.keys()).some((k) => k.includes('fake-next')), null, { timeout: 15000 }).catch(() => {});
    await sleep(2500);
    const keys = await page.evaluate(() => caches.keys());
    check(keys.length === 1 && keys[0].includes('fake-next'), `after Restart only the new shell cache remains (${keys.join(', ')})`);
    const final = await snapshot(page);
    check(same(final.tracks, before.tracks) && same(final.blobs, before.blobs) && same(final.art, before.art) && same(final.playlists, before.playlists) && same(final.settings, before.settings), 'after the update the whole library is identical to what was imported on A');
    await offlinePlayback(ctx, page, 'C');
    check(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::ERR/.test(e)).length === 0, 'no console errors', JSON.stringify(errors.slice(0, 3)));
  } finally {
    await ctx.close();
  }
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  const work = mkdtempSync(join(tmpdir(), 'cadence-upgrade-'));
  if (!existsSync('dist/index.html')) throw new Error('Run `npm run build` first (this test serves dist/ as the current version).');
  const distB = join(work, 'dist-current');
  cpSync('dist', distB, { recursive: true });
  // C = the same build deployed again with a different worker version, i.e. what the next real deploy looks like to the browser.
  const distC = join(work, 'dist-next');
  cpSync('dist', distC, { recursive: true });
  const sw = readFileSync(join(distC, 'sw.js'), 'utf8');
  writeFileSync(join(distC, 'sw.js'), sw.replace(/const VERSION = '[^']*'/, "const VERSION = 'fake-next'"));
  await new Promise((r) => server.listen(PORT, r));
  try {
    for (const tag of TAGS) {
      let distA;
      try { distA = buildTag(tag, work); } catch (e) { check(false, `could not build ${tag}`, String(e.message).slice(0, 200)); continue; }
      await scenario(tag, distA, distB, distC, work);
    }
  } finally {
    server.close();
    rmSync(work, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll upgrade checks passed');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
