import { db as defaultDb, newId, type CadenceDB } from './db';
import { isQuotaError, StorageQuotaError } from './errors';
import { attachSidecars, isLyricFile } from './lyrics';
import { sha256Hex } from './hash';
import { guessMime, looksLikeAudio, parseTags, titleFromFileName, type MetaParser } from './metadata';
import type { LicenseInfo, Track } from './types';

export interface ImportOptions {
  db?: CadenceDB;
  parse?: MetaParser;
  license?: LicenseInfo;
  onProgress?: (done: number, total: number, name: string) => void;
}

export type ImportOutcome =
  | { status: 'added'; track: Track }
  | { status: 'duplicate'; track: Track }
  | { status: 'skipped'; reason: string };

export interface ImportSummary {
  added: Track[];
  duplicates: Track[];
  failed: { name: string; error: string }[];
  /** Set when the import stopped early because storage ran out. */
  quotaExceeded: boolean;
  lyricsAttached: number;
  lyricsUnmatched: string[];
}

/** Imports one file. Writes track + audio + artwork in a single transaction: all or nothing. */
export async function importFile(file: File | Blob, name: string, opts: ImportOptions = {}): Promise<ImportOutcome> {
  const d = opts.db ?? defaultDb;
  const f = { name, type: file.type };
  if (!looksLikeAudio(f)) return { status: 'skipped', reason: 'Not an audio file' };

  const hash = await sha256Hex(file);
  const existing = await d.tracks.where('hash').equals(hash).first();
  if (existing) return { status: 'duplicate', track: existing };

  const meta = await (opts.parse ?? parseTags)(file, name);
  const id = newId();
  const now = Date.now();
  const track: Track = {
    id,
    hash,
    title: meta.title?.trim() || titleFromFileName(name),
    artist: meta.artist?.trim() || 'Unknown Artist',
    album: meta.album?.trim() || 'Unknown Album',
    duration: Number.isFinite(meta.duration) ? (meta.duration as number) : 0,
    trackNo: meta.trackNo,
    mime: guessMime(f),
    size: file.size,
    fileName: name,
    hasArt: !!meta.art,
    favorite: 0,
    addedAt: now,
    lastPlayedAt: 0,
    playCount: 0,
    license: opts.license,
    genre: meta.genre ?? '',
  };
  // Normalise the stored type so Safari picks the right decoder.
  const audio = file.type === track.mime ? file : file.slice(0, file.size, track.mime);

  try {
    await d.transaction('rw', [d.tracks, d.blobs, d.art, d.lyrics], async () => {
      await d.blobs.put({ trackId: id, blob: audio });
      if (meta.art) await d.art.put({ trackId: id, blob: meta.art });
      if (meta.lyrics) await d.lyrics.put({ trackId: id, ...meta.lyrics });
      await d.tracks.put(track);
    });
  } catch (e) {
    if (isQuotaError(e)) throw new StorageQuotaError();
    throw e;
  }
  return { status: 'added', track };
}

/** Imports many files sequentially (keeps memory flat on phones). Stops cleanly on quota errors. */
export async function importFiles(files: File[], opts: ImportOptions = {}): Promise<ImportSummary> {
  const summary: ImportSummary = { added: [], duplicates: [], failed: [], quotaExceeded: false, lyricsAttached: 0, lyricsUnmatched: [] };
  // .lrc / .txt files picked together with audio are lyric sidecars, matched by file name afterwards.
  const sidecars = files.filter((f) => isLyricFile(f.name));
  files = files.filter((f) => !isLyricFile(f.name));
  let done = 0;
  for (const file of files) {
    opts.onProgress?.(done, files.length, file.name);
    try {
      const r = await importFile(file, file.name, opts);
      if (r.status === 'added') summary.added.push(r.track);
      else if (r.status === 'duplicate') summary.duplicates.push(r.track);
      else summary.failed.push({ name: file.name, error: r.reason });
    } catch (e) {
      if (e instanceof StorageQuotaError) {
        summary.failed.push({ name: file.name, error: e.message });
        summary.quotaExceeded = true;
        break;
      }
      summary.failed.push({ name: file.name, error: e instanceof Error ? e.message : String(e) });
    }
    done++;
  }
  opts.onProgress?.(files.length, files.length, '');
  if (sidecars.length) {
    const d = opts.db ?? defaultDb;
    const r = await attachSidecars(sidecars, await d.tracks.toArray(), d);
    summary.lyricsAttached = r.attached;
    summary.lyricsUnmatched = r.unmatched;
  }
  return summary;
}

export async function deleteTrack(id: string, d: CadenceDB = defaultDb): Promise<void> {
  await d.transaction('rw', [d.tracks, d.blobs, d.art, d.playlists, d.lyrics], async () => {
    await d.tracks.delete(id);
    await d.lyrics.delete(id);
    await d.blobs.delete(id);
    await d.art.delete(id);
    const lists = await d.playlists.toArray();
    for (const p of lists) {
      if (p.trackIds.includes(id)) await d.playlists.update(p.id, { trackIds: p.trackIds.filter((t) => t !== id), updatedAt: Date.now() });
    }
  });
}

export async function toggleFavorite(id: string, d: CadenceDB = defaultDb): Promise<void> {
  const t = await d.tracks.get(id);
  if (t) await d.tracks.update(id, { favorite: t.favorite ? 0 : 1 });
}

export async function markPlayed(id: string, d: CadenceDB = defaultDb): Promise<void> {
  const t = await d.tracks.get(id);
  if (t) await d.tracks.update(id, { lastPlayedAt: Date.now(), playCount: t.playCount + 1 });
}

export function matchesQuery(t: Track, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return needle.split(/\s+/).every((w) => `${t.title} ${t.artist} ${t.album} ${t.fileName}`.toLowerCase().includes(w));
}

export async function searchTracks(q: string, d: CadenceDB = defaultDb): Promise<Track[]> {
  const all = await d.tracks.toArray();
  return all.filter((t) => matchesQuery(t, q)).sort((a, b) => a.title.localeCompare(b.title));
}

export interface Group {
  key: string;
  name: string;
  subtitle: string;
  trackIds: string[];
  artTrackId?: string;
}

export function groupAlbums(tracks: Track[]): Group[] {
  const map = new Map<string, Track[]>();
  for (const t of tracks) {
    const k = `${t.album}\u0000${t.artist}`;
    (map.get(k) ?? map.set(k, []).get(k)!).push(t);
  }
  return [...map.entries()]
    .map(([key, list]) => {
      list.sort((a, b) => (a.trackNo ?? 1e6) - (b.trackNo ?? 1e6) || a.title.localeCompare(b.title));
      return { key, name: list[0].album, subtitle: list[0].artist, trackIds: list.map((t) => t.id), artTrackId: list.find((t) => t.hasArt)?.id };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function groupArtists(tracks: Track[]): Group[] {
  const map = new Map<string, Track[]>();
  for (const t of tracks) (map.get(t.artist) ?? map.set(t.artist, []).get(t.artist)!).push(t);
  return [...map.entries()]
    .map(([name, list]) => ({
      key: name,
      name,
      subtitle: `${list.length} song${list.length === 1 ? '' : 's'}`,
      trackIds: list.map((t) => t.id),
      artTrackId: list.find((t) => t.hasArt)?.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
