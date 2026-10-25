import { db as defaultDb, type CadenceDB } from './db';
import { parseTags, type MetaParser } from './metadata';

/**
 * Tracks imported before genre/lyrics support have `genre === undefined`. This reads their tags once
 * (in the background, a few at a time) so moods and embedded lyrics work for the existing library.
 * Never overwrites lyrics the user already attached, never touches the audio.
 */
export async function backfillTags(opts: { db?: CadenceDB; parse?: MetaParser; limit?: number; onProgress?: () => void } = {}): Promise<number> {
  const d = opts.db ?? defaultDb;
  const parse = opts.parse ?? parseTags;
  const pending = (await d.tracks.toArray()).filter((t) => t.genre === undefined).slice(0, opts.limit ?? 200);
  let n = 0;
  for (const t of pending) {
    try {
      const row = await d.blobs.get(t.id);
      if (!row) { await d.tracks.update(t.id, { genre: '' }); continue; }
      const meta = await parse(row.blob, t.fileName);
      await d.transaction('rw', d.tracks, d.lyrics, async () => {
        await d.tracks.update(t.id, { genre: meta.genre ?? '' });
        if (meta.lyrics && !(await d.lyrics.get(t.id))) await d.lyrics.put({ trackId: t.id, ...meta.lyrics });
      });
      n++;
    } catch {
      await d.tracks.update(t.id, { genre: '' }).catch(() => {});
    }
    opts.onProgress?.();
    await new Promise((r) => setTimeout(r, 0)); // let the UI breathe between files
  }
  return n;
}
