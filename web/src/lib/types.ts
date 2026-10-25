export interface LicenseInfo {
  /** e.g. "CC BY 4.0" */
  name: string;
  url?: string;
  /** Who must be credited. */
  attribution: string;
  /** Page the file was obtained from. */
  sourceUrl?: string;
  sourceId?: string;
}

export interface Track {
  id: string;
  /** SHA-256 of the audio bytes, hex. Unique. */
  hash: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  trackNo?: number;
  mime: string;
  size: number;
  fileName: string;
  hasArt: boolean;
  /** 0 | 1 so it can be indexed. */
  favorite: 0 | 1;
  addedAt: number;
  lastPlayedAt: number;
  playCount: number;
  license?: LicenseInfo;
}

export interface TrackBlob {
  trackId: string;
  blob: Blob;
}

export interface TrackArt {
  trackId: string;
  blob: Blob;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface ParsedMeta {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  trackNo?: number;
  art?: Blob;
}
