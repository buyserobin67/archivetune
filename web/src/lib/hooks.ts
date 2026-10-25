import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { getArtUrl } from './art';
import { getStorageStatus, type StorageStatus } from './storage';
import type { Playlist, Track } from './types';

export function useTracks(): Track[] | undefined {
  return useLiveQuery(() => db.tracks.orderBy('title').toArray(), []);
}

export function usePlaylists(): Playlist[] | undefined {
  return useLiveQuery(() => db.playlists.orderBy('updatedAt').reverse().toArray(), []);
}

export function useArt(trackId?: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (trackId) void getArtUrl(trackId).then((u) => live && setUrl(u));
    return () => { live = false; };
  }, [trackId]);
  return url;
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
