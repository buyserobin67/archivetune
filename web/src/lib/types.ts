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
  /** First genre tag, '' when the file has none. undefined = tags not scanned yet (see backfill.ts). */
  genre?: string;
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

export interface LyricLine {
  /** Seconds from the start of the track. */
  t: number;
  text: string;
}

/** Lyrics supplied by the user: embedded in the file, an LRC/TXT sidecar, or pasted. Never fetched from a server. */
export interface Lyrics {
  trackId: string;
  kind: 'synced' | 'plain';
  lines?: LyricLine[];
  text?: string;
  source: 'embedded' | 'lrc' | 'manual';
}

export interface ParsedMeta {
  genre?: string;
  lyrics?: Omit<Lyrics, 'trackId'>;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  trackNo?: number;
  art?: Blob;
}

/**
 * A non-destructive artwork adjustment. The original bytes stay in the `art` store untouched; this row holds a trimmed
 * copy that is shown instead. `disabled` means "the user chose the original", `clean` means "scanned, nothing to trim".
 */
export interface ArtEdit {
  trackId: string;
  blob?: Blob;
  kind: 'transparent' | 'flat' | 'clean';
  disabled?: boolean;
  /** Trim rectangle in source pixels. */
  rect?: { x: number; y: number; w: number; h: number };
  from?: { w: number; h: number };
  to?: { w: number; h: number };
  createdAt: number;
}

/** One qualifying listen (30 s, or half of a short song). Names are copied so the recap survives deleting or renaming a song. Stays on this device. */
export interface PlayEvent {
  id?: number;
  trackId: string;
  /** When the listen started counting (ms since epoch). */
  at: number;
  /** Seconds actually listened, not skipped. */
  seconds: number;
  title: string;
  artist: string;
  album: string;
}
