import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { artVersion, getArtUrl, subscribeArt } from './art';
import { getStorageStatus, type StorageStatus } from './storage';
import { displayTrack } from './names';
import type { Playlist, Track } from './types';

export function useTracks(): Track[] | undefined {
  // Names are cleaned for display here, once, so every screen agrees (grouping, search, Go to artist).
  return useLiveQuery(() => db.tracks.orderBy('title').toArray().then((all) => all.map((t) => displayTrack(t))), []);
}

export function usePlaylists(): Playlist[] | undefined {
  return useLiveQuery(() => db.playlists.orderBy('updatedAt').reverse().toArray(), []);
}

export function useArt(trackId?: string): string | null {
  const [state, setState] = useState<{ id?: string; url: string | null }>({ url: null });
  // Re-run when this track's artwork is edited or restored.
  const version = useSyncExternalStore(subscribeArt, () => (trackId ? artVersion(trackId) : 0));
  useEffect(() => {
    let live = true;
    if (!trackId) { setState({ url: null }); return; }
    void getArtUrl(trackId).then((u) => live && setState({ id: trackId, url: u }));
    return () => { live = false; };
  }, [trackId, version]);
  // Never show the previous track's cover while the next one loads.
  return state.id === trackId ? state.url : null;
}

export function useStorageStatus(refreshKey: unknown = 0): StorageStatus | null {
  const [s, setS] = useState<StorageStatus | null>(null);
  useEffect(() => {
    let live = true;
    void getStorageStatus().then((v) => live && setS(v));
    return () => { live = false; };
  }, [refreshKey]);
  return s;
}

/** Small per-device preference (sort order etc.). localStorage can be unavailable (private mode), so never assume it works. */
export function usePref<T extends string | boolean>(key: string, fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem('cadence.' + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch { return fallback; }
  });
  const set = (n: T) => {
    setV(n);
    try { localStorage.setItem('cadence.' + key, JSON.stringify(n)); } catch { /* ignore */ }
  };
  return [v, set];
}
