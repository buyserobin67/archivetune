import { db as defaultDb, type CadenceDB } from './db';
import { baseName, isLyricFile, parseLyricsText, toLyrics } from './lrc';
import type { Lyrics, Track } from './types';

export { isLyricFile };

export async function getLyrics(trackId: string, d: CadenceDB = defaultDb): Promise<Lyrics | undefined> {
  return d.lyrics.get(trackId);
}

/** Saves lyrics from LRC or plain text the user provided. Returns null if the text held no lyrics. */
export async function saveLyricsText(trackId: string, text: string, source: Lyrics['source'], d: CadenceDB = defaultDb): Promise<Lyrics | null> {
  const lyrics = toLyrics(trackId, parseLyricsText(text), source);
  if (lyrics) await d.lyrics.put(lyrics);
  return lyrics;
}

export async function removeLyrics(trackId: string, d: CadenceDB = defaultDb): Promise<void> {
  await d.lyrics.delete(trackId);
}

/** Decodes a lyric file. Tries UTF-8 first, then Windows-1252 for old LRC files. */
export async function readLyricFile(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

const norm = (s: string) => baseName(s).replace(/^\d{1,3}\s*[-._)]\s*/, '');

/** Picks the track a sidecar belongs to: same file name first, then same title. */
export function matchSidecar(sidecarName: string, tracks: Pick<Track, 'id' | 'fileName' | 'title'>[]): string | null {
  const key = baseName(sidecarName);
  const exact = tracks.find((t) => baseName(t.fileName) === key);
  if (exact) return exact.id;
  const loose = norm(sidecarName);
  const byName = tracks.filter((t) => norm(t.fileName) === loose);
  if (byName.length === 1) return byName[0].id;
  const byTitle = tracks.filter((t) => norm(t.title) === loose);
  return byTitle.length === 1 ? byTitle[0].id : null;
}

export interface SidecarResult { attached: number; unmatched: string[] }

/** Attaches .lrc/.txt files to tracks (a sidecar replaces older lyrics, because the user just chose it). */
export async function attachSidecars(files: File[], tracks: Track[], d: CadenceDB = defaultDb): Promise<SidecarResult> {
  const res: SidecarResult = { attached: 0, unmatched: [] };
  for (const f of files) {
    const id = matchSidecar(f.name, tracks);
    if (!id) { res.unmatched.push(f.name); continue; }
    const ok = await saveLyricsText(id, await readLyricFile(f), 'lrc', d);
    if (ok) res.attached++; else res.unmatched.push(f.name);
  }
  return res;
}
