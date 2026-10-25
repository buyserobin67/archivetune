import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const sources = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes('/test/'));

describe('data safety guard', () => {
  const forbidden: [string, RegExp][] = [
    ['deleteDatabase', /deleteDatabase\s*\(/],
    ['Dexie.delete', /Dexie\.delete\s*\(/],
    ['db.delete()', /\bdb\.delete\s*\(/],
    ['clearing library tables (artEdits holds only derived trims, so its undo may clear it)', /\b(tracks|blobs|art|playlists|settings|lyrics)\.clear\s*\(/],
    ['localStorage.clear', /localStorage\.clear\s*\(/],
    ['unregistering service workers', /\.unregister\s*\(/],
    ['Cache Storage wipe', /caches\.delete\s*\(\s*(?!k\b)/],
    ['Storage API clear-site-data', /Clear-Site-Data/i],
  ];
  for (const [label, re] of forbidden) {
    it(`app code never uses ${label}`, () => {
      const hits = sources.filter((f) => re.test(readFileSync(f, 'utf8')));
      expect(hits).toEqual([]);
    });
  }

  it('the service worker only deletes old cadence-shell caches and never unregisters', () => {
    const sw = readFileSync('public/sw.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(sw).not.toMatch(/unregister|indexedDB|deleteDatabase/);
    expect(sw).toMatch(/startsWith\('cadence-shell-'\)/);
    const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('message'"));
    expect(install).not.toContain('skipWaiting');
  });

  it('the database name stays "cadence" and the frozen schema versions are not edited', () => {
    const src = readFileSync('src/lib/db.ts', 'utf8');
    expect(src).toContain("constructor(name = 'cadence')");
    expect(src).toContain("this.version(2).stores({ lyrics: 'trackId' })");
    expect(src).toContain("this.version(3).stores({ artEdits: 'trackId' })");
    expect(src).toContain("this.version(4).stores({ plays: '++id, at, trackId' })");
    expect(src).toContain("tracks: 'id, &hash, title, artist, album, favorite, addedAt, lastPlayedAt'");
  });
});
