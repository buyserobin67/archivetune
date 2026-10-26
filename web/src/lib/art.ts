import { db as defaultDb, type CadenceDB } from './db';
import { getArtBlob } from './artSource';
import { forgetArtColours } from './palette';

const cache = new Map<string, Promise<string | null>>();
const squares = new Map<string, Promise<string | null>>();
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

/** The centred square of a w x h image: what `object-cover` shows in a square frame. */
export function centerSquare(w: number, h: number): { x: number; y: number; s: number } {
  const s = Math.min(w, h);
  return { x: Math.round((w - s) / 2), y: Math.round((h - s) / 2), s };
}

/** Re-encodes artwork as the same centred square the app shows, at most `max` px. null where canvas is unavailable. */
export async function squareArtBlob(blob: Blob, max = 512): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  const bmp = await createImageBitmap(blob);
  try {
    const { x, y, s } = centerSquare(bmp.width, bmp.height);
    const size = Math.min(max, s);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, x, y, s, s, 0, 0, size, size);
    return await new Promise((ok) => canvas.toBlob((b) => ok(b), 'image/jpeg', 0.9));
  } finally { bmp.close?.(); }
}

/**
 * Artwork for the lock screen, Control Center and the Dynamic Island. iOS shows whatever image it is given as is, so
 * a wide or padded cover would appear with bars there while the app shows a square. This hands iOS the same square.
 * Falls back to the plain artwork if the image cannot be redrawn.
 */
export function getSquareArtUrl(trackId: string, d: CadenceDB = defaultDb): Promise<string | null> {
  let p = squares.get(trackId);
  if (!p) {
    p = getArtBlob(trackId, d)
      .then(async (b) => {
        if (!b) return null;
        const sq = await squareArtBlob(b).catch(() => null);
        return sq ? URL.createObjectURL(sq) : getArtUrl(trackId, d);
      })
      .catch(() => null);
    squares.set(trackId, p);
  }
  return p;
}

/** Drops the cached object URL and colours. `revokeAfterMs` keeps the old URL alive briefly so covers still on screen don't 404 mid-swap. */
export async function forgetArt(trackId: string, revokeAfterMs = 0): Promise<void> {
  const p = cache.get(trackId);
  cache.delete(trackId);
  forgetArtColours(trackId);
  const sq = squares.get(trackId);
  squares.delete(trackId);
  // The lock screen may still be showing it: revoke after a moment, never immediately.
  void sq?.then((u) => { if (u) setTimeout(() => URL.revokeObjectURL(u), Math.max(revokeAfterMs, 4000)); });
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
