import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Base path. GitHub Pages serves project sites from /<repo>/, CI passes
 * VITE_BASE=/<repo>/. Local dev and preview default to "/".
 */
const base = normalizeBase(process.env.VITE_BASE ?? '/');

function normalizeBase(b: string): string {
  if (!b.startsWith('/')) b = '/' + b;
  return b.endsWith('/') ? b : b + '/';
}

/** Version stamp shown in Settings. `VITE_APP_BUILD` overrides it (used by the upgrade tests to fake a new deploy). */
function buildId(): string {
  const env = process.env.VITE_APP_BUILD || process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA;
  if (env) return env.slice(0, 9);
  try { return execSync('git rev-parse --short=9 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'dev'; }
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
export const appDefines = {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __APP_BUILD__: JSON.stringify(buildId()),
  __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  // Cloudflare Pages sets this while building; it lets a frozen deploy address point to the live address of its branch.
  __APP_BRANCH__: JSON.stringify(process.env.CF_PAGES_BRANCH ?? ''),
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/**
 * After the bundle is written: list every emitted file, hash the set, and
 * inject both into dist/sw.js. Also copy index.html to 404.html so GitHub Pages
 * serves the app shell for unknown paths.
 */
/**
 * Files read by the host and never served (Cloudflare `_headers`, `_redirects`, `_routes.json`; dotfiles). Precaching
 * one of them makes every service-worker install fail with a 404, which silently blocks all updates.
 */
export const isHostConfig = (f: string) => /^(_headers|_redirects|_routes\.json)$|(^|\/)\./.test(f);

function serviceWorkerManifest(): Plugin {
  let outDir = 'dist';
  return {
    name: 'cadence-sw-manifest',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && f !== '404.html' && !f.endsWith('.map') && !f.startsWith('splash/') && !isHostConfig(f));
      const hash = createHash('sha256');
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const swPath = join(outDir, 'sw.js');
      const sw = readFileSync(swPath, 'utf8')
        .replace('__PRECACHE_FILES__', JSON.stringify(files))
        .replace('__SW_VERSION__', version);
      writeFileSync(swPath, sw);
      copyFileSync(join(outDir, 'index.html'), join(outDir, '404.html'));
    },
  };
}

export default defineConfig({
  base,
  define: appDefines,
  plugins: [react(), serviceWorkerManifest()],
  build: { target: 'es2022', sourcemap: false },
});
