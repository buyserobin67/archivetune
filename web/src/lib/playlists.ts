import { db as defaultDb, newId, type CadenceDB } from './db';
import type { Playlist } from './types';

export async function createPlaylist(name: string, d: CadenceDB = defaultDb): Promise<Playlist> {
  const now = Date.now();
  const p: Playlist = { id: newId(), name: name.trim() || 'New Playlist', trackIds: [], createdAt: now, updatedAt: now };
  await d.playlists.put(p);
  return p;
}

export async function renamePlaylist(id: string, name: string, d: CadenceDB = defaultDb): Promise<void> {
  await d.playlists.update(id, { name: name.trim() || 'Playlist', updatedAt: Date.now() });
}

export async function deletePlaylist(id: string, d: CadenceDB = defaultDb): Promise<void> {
  await d.playlists.delete(id);
}

/** Adds tracks, skipping ones already in the playlist. Returns how many were added. */
export async function addToPlaylist(id: string, trackIds: string[], d: CadenceDB = defaultDb): Promise<number> {
  return d.transaction('rw', d.playlists, async () => {
    const p = await d.playlists.get(id);
    if (!p) return 0;
    const fresh = trackIds.filter((t, i) => !p.trackIds.includes(t) && trackIds.indexOf(t) === i);
    if (fresh.length) await d.playlists.update(id, { trackIds: [...p.trackIds, ...fresh], updatedAt: Date.now() });
    return fresh.length;
  });
}

export async function removeFromPlaylist(id: string, trackId: string, d: CadenceDB = defaultDb): Promise<void> {
  const p = await d.playlists.get(id);
  if (p) await d.playlists.update(id, { trackIds: p.trackIds.filter((t) => t !== trackId), updatedAt: Date.now() });
}

export async function movePlaylistTrack(id: string, from: number, to: number, d: CadenceDB = defaultDb): Promise<void> {
  const p = await d.playlists.get(id);
  if (!p || from === to || from < 0 || to < 0 || from >= p.trackIds.length || to >= p.trackIds.length) return;
  const ids = [...p.trackIds];
  const [x] = ids.splice(from, 1);
  ids.splice(to, 0, x);
  await d.playlists.update(id, { trackIds: ids, updatedAt: Date.now() });
}
