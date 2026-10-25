import { db as defaultDb, type CadenceDB } from './db';

const cache = new Map<string, Promise<string | null>>();

/** Object URL for a track's embedded artwork (cached for the session), or null. */
export function getArtUrl(trackId: string, d: CadenceDB = defaultDb): Promise<string | null> {
  let p = cache.get(trackId);
  if (!p) {
    p = d.art.get(trackId).then((r) => (r ? URL.createObjectURL(r.blob) : null)).catch(() => null);
    cache.set(trackId, p);
  }
  return p;
}

export async function forgetArt(trackId: string): Promise<void> {
  const p = cache.get(trackId);
  cache.delete(trackId);
  const url = p ? await p : null;
  if (url) URL.revokeObjectURL(url);
}
