import { db as defaultDb, type CadenceDB } from './db';
import { isQuotaError, StorageQuotaError } from './errors';
import type { Lyrics, Playlist, Track } from './types';

/**
 * Backup container (".cadence"):
 *   "CADENCE1\n" | u32 BE manifestLength | manifest JSON (utf-8) | blob bytes...
 * The manifest lists each blob's offset (relative to the end of the manifest) and length, so
 * restore can slice the file lazily instead of loading gigabytes into memory.
 */
const MAGIC = 'CADENCE1\n';

interface BlobRef { offset: number; length: number; type: string }
interface Manifest {
  version: 1;
  exportedAt: number;
  includesAudio: boolean;
  tracks: { track: Track; audio?: BlobRef; art?: BlobRef }[];
  playlists: Playlist[];
  /** Optional: backups made before lyrics existed have no such field. */
  lyrics?: Lyrics[];
}

export async function exportLibrary(opts: { includeAudio: boolean; db?: CadenceDB }): Promise<Blob> {
  const d = opts.db ?? defaultDb;
  const tracks = await d.tracks.toArray();
  const playlists = await d.playlists.toArray();
  const parts: Blob[] = [];
  let offset = 0;
  const push = (b: Blob): BlobRef => {
    const ref = { offset, length: b.size, type: b.type };
    parts.push(b);
    offset += b.size;
    return ref;
  };
  const entries: Manifest['tracks'] = [];
  for (const track of tracks) {
    const e: Manifest['tracks'][number] = { track };
    if (opts.includeAudio) {
      const audio = await d.blobs.get(track.id);
      if (audio) e.audio = push(audio.blob);
    }
    const art = await d.art.get(track.id);
    if (art) e.art = push(art.blob);
    entries.push(e);
  }
  const lyrics = await d.lyrics.toArray();
  const manifest: Manifest = { version: 1, exportedAt: Date.now(), includesAudio: opts.includeAudio, tracks: entries, playlists, lyrics };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, json.length);
  return new Blob([MAGIC, len, json, ...parts], { type: 'application/octet-stream' });
}

export interface RestoreSummary {
  tracksAdded: number;
  tracksSkipped: number;
  audioMissing: number;
  playlistsRestored: number;
}

export async function importBackup(file: Blob, opts: { db?: CadenceDB } = {}): Promise<RestoreSummary> {
  const d = opts.db ?? defaultDb;
  const head = await file.slice(0, MAGIC.length + 4).arrayBuffer();
  const magic = new TextDecoder().decode(head.slice(0, MAGIC.length));
  if (magic !== MAGIC) throw new Error('This is not a Cadence backup file.');
  const mlen = new DataView(head).getUint32(MAGIC.length);
  const mStart = MAGIC.length + 4;
  const manifest = JSON.parse(await file.slice(mStart, mStart + mlen).text()) as Manifest;
  if (manifest.version !== 1) throw new Error('Unsupported backup version.');
  const dataStart = mStart + mlen;
  const slice = (r: BlobRef) => file.slice(dataStart + r.offset, dataStart + r.offset + r.length, r.type);

  const summary: RestoreSummary = { tracksAdded: 0, tracksSkipped: 0, audioMissing: 0, playlistsRestored: 0 };
  const idMap = new Map<string, string>(); // backup id -> local id

  for (const e of manifest.tracks) {
    const existing = await d.tracks.where('hash').equals(e.track.hash).first();
    if (existing) {
      idMap.set(e.track.id, existing.id);
      // A metadata-only backup was restored earlier? Fill in missing audio if this one has it.
      if (e.audio && !(await d.blobs.get(existing.id))) {
        await putBlobSafe(d, () => d.blobs.put({ trackId: existing.id, blob: slice(e.audio!) }));
      }
      summary.tracksSkipped++;
      continue;
    }
    idMap.set(e.track.id, e.track.id);
    await putBlobSafe(d, () =>
      d.transaction('rw', d.tracks, d.blobs, d.art, async () => {
        if (e.audio) await d.blobs.put({ trackId: e.track.id, blob: slice(e.audio) });
        if (e.art) await d.art.put({ trackId: e.track.id, blob: slice(e.art) });
        await d.tracks.put(e.track);
      }),
    );
    if (!e.audio) summary.audioMissing++;
    summary.tracksAdded++;
  }

  for (const l of manifest.lyrics ?? []) {
    const id = idMap.get(l.trackId);
    if (id && !(await d.lyrics.get(id))) await d.lyrics.put({ ...l, trackId: id });
  }

  for (const p of manifest.playlists) {
    const trackIds = p.trackIds.map((t) => idMap.get(t)).filter((t): t is string => !!t);
    const cur = await d.playlists.get(p.id);
    if (cur) {
      const merged = [...cur.trackIds, ...trackIds.filter((t) => !cur.trackIds.includes(t))];
      await d.playlists.update(p.id, { trackIds: merged, updatedAt: Date.now() });
    } else {
      await d.playlists.put({ ...p, trackIds });
    }
    summary.playlistsRestored++;
  }
  return summary;
}

async function putBlobSafe(_d: CadenceDB, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (isQuotaError(e)) throw new StorageQuotaError();
    throw e;
  }
}

/** Tracks whose audio is not stored (e.g. restored from a metadata-only backup). */
export async function tracksMissingAudio(d: CadenceDB = defaultDb): Promise<string[]> {
  const ids = (await d.tracks.toCollection().primaryKeys()) as string[];
  const have = new Set((await d.blobs.toCollection().primaryKeys()) as string[]);
  return ids.filter((id) => !have.has(id));
}
