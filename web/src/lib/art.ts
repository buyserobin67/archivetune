import { db as defaultDb, type CadenceDB } from './db';
import { getArtBlob } from './artSource';
import { forgetArtColours } from './palette';

const cache = new Map<string, Promise<string | null>>();
const versions = new Map<string, number>();
const listeners = new Set<() => void>();

/** Object URL for a track's artwork (trimmed copy if present, else original), cached for the session, or null. */
export function getArtUrl(trackId: string, d: CadenceDB = defaultDb): Promise<string | null> {
  let p = cache.get(trackId);
  if (!p) {
    p = getArtBlob(trackId, d).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null);
    cache.set(trackId, p);
  }
  return p;
}

/** Drops the cached object URL and colours. `revokeAfterMs` keeps the old URL alive briefly so covers still on screen don't 404 mid-swap. */
export async function forgetArt(trackId: string, revokeAfterMs = 0): Promise<void> {
  const p = cache.get(trackId);
  cache.delete(trackId);
  forgetArtColours(trackId);
  const url = p ? await p : null;
  if (!url) return;
  if (revokeAfterMs > 0) setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
  else URL.revokeObjectURL(url);
}

/** Call after an artwork edit/undo: drops cached URLs and colours and tells mounted covers to reload. */
export async function invalidateArt(trackId: string): Promise<void> {
  await forgetArt(trackId, 4000);
  versions.set(trackId, (versions.get(trackId) ?? 0) + 1);
  listeners.forEach((l) => l());
}

export const artVersion = (trackId: string) => versions.get(trackId) ?? 0;
export function subscribeArt(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
