import { db as defaultDb, type CadenceDB } from './db';
import { TAGS_V } from './library';
import { parseTags, type MetaParser } from './metadata';
import type { Track } from './types';

/**
 * Tracks imported before a tag was supported (genre, disc number, ReplayGain) are re-read once, in the background, a few
 * at a time, so moods, disc order, levelling and embedded lyrics work for the existing library. `tagsV` records the pass.
 * Never overwrites lyrics the user already attached or a genre already read, never touches the audio.
 */
export async function backfillTags(opts: { db?: CadenceDB; parse?: MetaParser; limit?: number; onProgress?: () => void } = {}): Promise<number> {
  const d = opts.db ?? defaultDb;
  const parse = opts.parse ?? parseTags;
  const stale = (t: Track) => t.genre === undefined || (t.tagsV ?? 1) < TAGS_V;
  const pending = (await d.tracks.toArray()).filter(stale).slice(0, opts.limit ?? 200);
  let n = 0;
  for (const t of pending) {
    try {
      const row = await d.blobs.get(t.id);
      if (!row) { await d.tracks.update(t.id, { genre: t.genre ?? '', tagsV: TAGS_V }); continue; }
      const meta = await parse(row.blob, t.fileName);
      await d.transaction('rw', d.tracks, d.lyrics, async () => {
        await d.tracks.update(t.id, { genre: t.genre ?? meta.genre ?? '', discNo: meta.discNo, gain: meta.gain, tagsV: TAGS_V });
        if (meta.lyrics && !(await d.lyrics.get(t.id))) await d.lyrics.put({ trackId: t.id, ...meta.lyrics });
      });
      n++;
    } catch {
      await d.tracks.update(t.id, { genre: t.genre ?? '', tagsV: TAGS_V }).catch(() => {});
    }
    opts.onProgress?.();
    await new Promise((r) => setTimeout(r, 0)); // let the UI breathe between files
  }
  return n;
}
