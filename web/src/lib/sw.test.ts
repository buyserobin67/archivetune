import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SCOPE = 'https://user.github.io/archivetune/';
const FILES = ['index.html', 'assets/app-abc.js', 'assets/app-abc.css', 'manifest.webmanifest', 'icons/icon-192.png'];

type Handler = (e: any) => void;

function boot(version = 'v1', network: Record<string, string> = {}, store = new Map<string, Map<string, Response>>()) {
  const handlers: Record<string, Handler> = {};
  let online = true;
  const fetchLog: string[] = [];
  const fetchImpl = async (r: string | { url: string }) => {
    const url = typeof r === 'string' ? r : r.url;
    fetchLog.push(url);
    const path = url.replace(SCOPE, '');
    if (!online) throw new TypeError('offline');
    if (path in network) return new Response(network[path], { status: 200 });
    if (path === '') return new Response('<html>shell</html>');
    return new Response('nope', { status: 404 });
  };
  const key = (r: string | { url: string }, ignoreSearch?: boolean) => {
    const u = typeof r === 'string' ? r : r.url;
    return ignoreSearch ? u.split('?')[0] : u;
  };
  const makeCache = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name)!;
    return {
      put: async (r: any, res: Response) => { m.set(key(r), res); },
      match: async (r: any, o?: { ignoreSearch?: boolean }) => {
        const k = key(r, o?.ignoreSearch);
        for (const [mk, v] of m) if (key(mk, o?.ignoreSearch) === k) return v.clone();
        return undefined;
      },
      addAll: async (urls: string[]) => { for (const u of urls) { const res = await fetchImpl(u); if (!res.ok) throw new Error('addAll failed ' + u); m.set(u, res); } },
    };
  };
  const self: any = {
    registration: { scope: SCOPE },
    location: new URL(SCOPE + 'sw.js'),
    addEventListener: (t: string, h: Handler) => { handlers[t] = h; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const skipped = { count: 0 };
  self.skipWaiting = async () => { skipped.count++; };
  const src = readFileSync('public/sw.js', 'utf8').replace('__SW_VERSION__', version).replace('__PRECACHE_FILES__', JSON.stringify(FILES));
  vm.runInNewContext(src, {
    self, caches: { open: async (n: string) => makeCache(n), keys: async () => [...store.keys()], delete: async (n: string) => store.delete(n) },
    fetch: fetchImpl, Response, URL, Promise, Object, JSON,
  });
  const run = async (type: string, event: any) => {
    let p: Promise<any> | undefined;
    event.waitUntil = (x: Promise<any>) => { p = x; };
    event.respondWith = (x: Promise<any>) => { p = x; };
    handlers[type](event);
    return p;
  };
  const request = (path: string, init: Partial<{ method: string; mode: string }> = {}) => ({ url: path.startsWith('http') ? path : SCOPE + path, method: init.method ?? 'GET', mode: init.mode ?? 'cors' });
  return {
    store, fetchLog, handlers, skipped,
    message: (data: any, ports: any[] = []) => handlers.message({ data, ports }),
    setOnline: (v: boolean) => { online = v; },
    install: () => run('install', {}),
    activate: () => run('activate', {}),
    fetch: (path: string, init?: any) => run('fetch', { request: request(path, init) }),
    hasFetchHandler: () => !!handlers.fetch,
  };
}

const network = { 'index.html': '<html>shell</html>', 'assets/app-abc.js': 'js', 'assets/app-abc.css': 'css', 'manifest.webmanifest': '{}', 'icons/icon-192.png': 'png' };

describe('service worker caching', () => {
  it('precaches the app shell on install under a versioned cache', async () => {
    const sw = boot('v1', network);
    await sw.install();
    const cache = sw.store.get('cadence-shell-v1')!;
    expect([...cache.keys()].sort()).toEqual([SCOPE, ...FILES.map((f) => SCOPE + f)].sort());
  });

  it('serves the shell for any in-scope navigation while offline (direct links, refresh)', async () => {
    const sw = boot('v1', network);
    await sw.install();
    sw.setOnline(false);
    for (const path of ['', 'index.html', 'library/songs', '404.html']) {
      const res = (await sw.fetch(path, { mode: 'navigate' })) as Response;
      expect(await res.text()).toContain('shell');
    }
  });

  it('serves hashed assets from cache while offline', async () => {
    const sw = boot('v1', network);
    await sw.install();
    sw.setOnline(false);
    const res = (await sw.fetch('assets/app-abc.js?x=1')) as Response;
    expect(await res.text()).toBe('js');
    expect(sw.fetchLog.filter((u) => u.includes('assets/app-abc.js')).length).toBe(1); // only the install fetch
  });

  it('leaves cross-origin requests and non-GET requests alone', async () => {
    const sw = boot('v1', network);
    await sw.install();
    let responded = false;
    const ev: any = { request: { url: 'https://cdn.example.com/a.mp3', method: 'GET', mode: 'cors' }, respondWith: () => { responded = true; } };
    sw.handlers.fetch(ev);
    expect(responded).toBe(false);
    ev.request = { url: SCOPE + 'x', method: 'POST', mode: 'cors' };
    sw.handlers.fetch(ev);
    expect(responded).toBe(false);
  });

  it('drops caches from older versions on activate', async () => {
    const store = new Map<string, Map<string, Response>>();
    const old = boot('old', network, store);
    await old.install();
    const next = boot('new', network, store);
    await next.install();
    await next.activate();
    expect([...store.keys()]).toEqual(['cadence-shell-new']);
  });

  it('a new version waits: install never skips waiting, only the Restart message does', async () => {
    const sw = boot('v2', network);
    await sw.install();
    expect(sw.skipped.count).toBe(0);
    sw.message({ type: 'SKIP_WAITING' });
    expect(sw.skipped.count).toBe(1);
    sw.message({ type: 'something-else' });
    expect(sw.skipped.count).toBe(1);
  });

  it('reports its version over a MessagePort', () => {
    const sw = boot('v7', network);
    const got: any[] = [];
    sw.message({ type: 'GET_VERSION' }, [{ postMessage: (m: any) => got.push(m) }]);
    expect(got).toEqual([{ version: 'v7' }]);
  });

  it('activating a new version removes only old cadence-shell caches, never other storage', async () => {
    const store = new Map<string, Map<string, Response>>();
    store.set('user-data-cache', new Map([['k', new Response('keep')]]));
    const old = boot('old', network, store);
    await old.install();
    const next = boot('new', network, store);
    await next.install();
    await next.activate();
    expect([...store.keys()].sort()).toEqual(['cadence-shell-new', 'user-data-cache']);
  });

  it('install fails (and the old worker stays) if a shell file cannot be fetched', async () => {
    const sw = boot('v1', { 'index.html': 'x' });
    await expect(sw.install()).rejects.toThrow();
  });

  it('build placeholders exist in the source worker', () => {
    const src = readFileSync('public/sw.js', 'utf8');
    expect(src).toContain('__PRECACHE_FILES__');
    expect(src).toContain('__SW_VERSION__');
  });
});
