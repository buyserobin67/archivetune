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
