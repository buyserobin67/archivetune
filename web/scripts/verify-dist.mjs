// Fails the build if the output would break on GitHub Pages. Usage: node scripts/verify-dist.mjs /repo/
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const base = process.argv[2] ?? '/';
const fail = (m) => { console.error('verify-dist: ' + m); process.exit(1); };

for (const f of ['index.html', '404.html', 'sw.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'])
  if (!existsSync('dist/' + f)) fail('missing dist/' + f);

const html = readFileSync('dist/index.html', 'utf8');
if (!html.includes(`href="${base}manifest.webmanifest"`)) fail(`index.html does not reference ${base}manifest.webmanifest`);
const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1]);
if (!assets.length || assets.some((a) => !a.startsWith(base + 'assets/'))) fail('asset URLs do not start with the base path: ' + assets.join(', '));

const sw = readFileSync('dist/sw.js', 'utf8');
if (sw.includes('__PRECACHE_FILES__') || sw.includes('__SW_VERSION__')) fail('service worker placeholders were not replaced');
const files = JSON.parse(/const FILES = (\[.*\]);/.exec(sw)?.[1] ?? 'null');
if (!files?.includes('index.html')) fail('service worker precache list is empty');
for (const f of files) if (!existsSync('dist/' + f)) fail('precached file missing from dist: ' + f);
// Hosts read these and answer 404 for them, so precaching one makes every service-worker install (and update) fail.
for (const f of files) if (/^(_headers|_redirects|_routes\.json)$|(^|\/)\./.test(f)) fail('host config file must not be precached: ' + f);
if (!readdirSync('dist/assets').some((f) => f.endsWith('.js'))) fail('no JS bundle');

// Nothing resembling personal media may ship: the app only ever stores music on the user's device.
const AUDIO = /\.(mp3|m4a|aac|wav|aiff?|flac|ogg|opus|caf|mp4|mov|webm)$/i;
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
const media = walk('dist').filter((f) => AUDIO.test(f));
if (media.length) fail('audio/video files found in dist: ' + media.join(', '));

const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
if (manifest.start_url !== './' || manifest.scope !== './') fail('manifest start_url/scope must be relative so it works under /<repo>/');
console.log(`verify-dist OK: base=${base}, ${files.length} precached files`);
