/* Cadence service worker: precaches the app shell so the UI loads offline.
 * Audio and the library live in IndexedDB, never here, and this worker never touches IndexedDB.
 * The two placeholders below are replaced at build time by vite.config.ts.
 *
 * Update rules (see docs/UPDATES_AND_DATA.md):
 *  - A new version installs in the background and WAITS. It is only activated when the app asks (the
 *    "Restart to update" button sends SKIP_WAITING), so a running page never loses the files it is using.
 *  - On activation only OLD shell caches (cadence-shell-*) are removed. Nothing else is deleted, and the
 *    worker is never unregistered. */
const VERSION = '__SW_VERSION__';
const CACHE = 'cadence-shell-' + VERSION;
const FILES = __PRECACHE_FILES__;

const scopeUrl = (p) => new URL(p, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([scopeUrl('./'), ...FILES.map(scopeUrl)])),
    // No skipWaiting here: an updated worker waits until the user chooses to restart.
  );
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cadence-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch third-party requests
  if (!url.href.startsWith(self.registration.scope)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === 'navigate') {
        // Offline-first app shell: any in-scope navigation gets index.html.
        const shell = (await cache.match(scopeUrl('./'))) || (await cache.match(scopeUrl('index.html')));
        if (shell) return shell;
        try { return await fetch(req); } catch { return Response.error(); }
      }
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })(),
  );
});
