import Dexie, { type Table } from 'dexie';
import type { Lyrics, Playlist, Setting, Track, TrackArt, TrackBlob } from './types';

export class CadenceDB extends Dexie {
  tracks!: Table<Track, string>;
  blobs!: Table<TrackBlob, string>;
  art!: Table<TrackArt, string>;
  playlists!: Table<Playlist, string>;
  settings!: Table<Setting, string>;
  lyrics!: Table<Lyrics, string>;

  constructor(name = 'cadence') {
    super(name);
    this.version(1).stores({
      tracks: 'id, &hash, title, artist, album, favorite, addedAt, lastPlayedAt',
      // Audio and artwork live in their own stores so list queries never drag blobs along.
      blobs: 'trackId',
      art: 'trackId',
      playlists: 'id, name, updatedAt',
      settings: 'key',
    });
    // v2 only adds a table: every v1 store and row is carried over untouched.
    this.version(2).stores({ lyrics: 'trackId' });
  }
}

export const db = new CadenceDB();

export async function getSetting<T>(key: string, fallback: T, d: CadenceDB = db): Promise<T> {
  const row = await d.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown, d: CadenceDB = db): Promise<void> {
  await d.settings.put({ key, value });
}

export function newId(): string {
  return crypto.randomUUID();
}
