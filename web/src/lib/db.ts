import Dexie, { type Table } from 'dexie';
import { APP_BUILD, APP_VERSION } from './appInfo';
import type { ArtEdit, Lyrics, PlayEvent, Playlist, Setting, SkipEvent, Track, TrackArt, TrackBlob } from './types';

/**
 * DATA SAFETY CONTRACT
 * ====================
 * Your music lives in this IndexedDB database, named "cadence", and it is never recreated or deleted by the app.
 *
 * Changing the schema:
 *  1. NEVER edit or remove an existing `this.version(n)` block. Old databases on people's phones were created by them.
 *  2. Add a new block `this.version(n + 1).stores({ ...only the stores you add or re-index })`.
 *     If rows must be reshaped, add `.upgrade((tx) => ...)`. It runs in one transaction: it either completes or the
 *     database stays at the old version with all data intact.
 *  3. Bump SCHEMA_VERSION and add a seeded-database case to src/lib/migrations.test.ts.
 *  4. Optional row fields do not need a migration (see Track.genre); readers must tolerate their absence.
 *
 * Forbidden anywhere in the app (enforced by src/lib/dataSafety.test.ts): deleteDatabase, Dexie.delete, db.delete,
 * clearing library tables, localStorage.clear, unregistering service workers.
 */
export const SCHEMA_VERSION = 5;

export class CadenceDB extends Dexie {
  tracks!: Table<Track, string>;
  blobs!: Table<TrackBlob, string>;
  art!: Table<TrackArt, string>;
  playlists!: Table<Playlist, string>;
  settings!: Table<Setting, string>;
  lyrics!: Table<Lyrics, string>;
  artEdits!: Table<ArtEdit, string>;
  plays!: Table<PlayEvent, number>;
  skips!: Table<SkipEvent, number>;

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
    // v3 only adds a table for non-destructive artwork trims; the original images in `art` are never modified.
    this.version(3).stores({ artEdits: 'trackId' });
    // v4 only adds the on-device listening log behind the recap. Nothing existing changes.
    this.version(4).stores({ plays: '++id, at, trackId' });
    // v5 only adds a log of songs skipped early, so listening patterns can learn what not to suggest.
    this.version(5).stores({ skips: '++id, at, trackId' });
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

// ---- opening the database safely ----

export type OpenFailure = 'newer' | 'unavailable' | 'blocked' | 'failed';

export type OpenResult =
  | { ok: true; /** Version found on disk before opening, null for a brand-new install. */ from: number | null; to: number }
  | { ok: false; reason: OpenFailure; message: string; error: unknown };

/** The version currently stored on this device, read without upgrading or creating anything. null = no database yet. */
export async function readStoredVersion(name: string): Promise<number | null> {
  const probe = new Dexie(name);
  try {
    await probe.open(); // dynamic mode: opens whatever exists, never upgrades, never creates
    return probe.verno;
  } catch (e) {
    if ((e as { name?: string })?.name === 'NoSuchDatabaseError') return null;
    return null;
  } finally {
    probe.close();
  }
}

/**
 * Opens the library. Upgrades run inside Dexie's single versionchange transaction, so a failed upgrade leaves the
 * database exactly as it was. On any failure nothing is deleted or reset: the caller shows a recovery screen.
 */
export async function openDatabase(d: CadenceDB = db): Promise<OpenResult> {
  const from = await readStoredVersion(d.name);
  try {
    await d.open();
    return { ok: true, from, to: d.verno };
  } catch (error) {
    const e = error as { name?: string; message?: string; inner?: { name?: string } };
    const names = `${e.name} ${e.inner?.name}`;
    const message = e.message ?? String(error);
    if (/VersionError/.test(names)) return { ok: false, reason: 'newer', message, error };
    if (/InvalidState|SecurityError|MissingAPI/.test(names)) return { ok: false, reason: 'unavailable', message, error };
    if (/Blocked/.test(names)) return { ok: false, reason: 'blocked', message, error };
    return { ok: false, reason: 'failed', message, error };
  }
}

/** Another window upgraded the database: this connection is closed by Dexie, so tell the user to reload. */
export function onDatabaseClosedByUpgrade(fn: () => void, d: CadenceDB = db): void {
  d.on('versionchange', () => { fn(); return true; }); // true lets Dexie close this connection and let the upgrade proceed
}

// ---- which builds have opened this library ----

export interface AppRun { version: string; build: string; schema: number; at: number }
const RUNS_KEY = 'appRuns';

/** Appends to a short history whenever the build that opens the library changes. Failure here must never matter. */
export async function recordAppRun(d: CadenceDB = db, now = Date.now()): Promise<AppRun[]> {
  try {
    const runs = await getSetting<AppRun[]>(RUNS_KEY, [], d);
    const last = runs[runs.length - 1];
    if (last && last.version === APP_VERSION && last.build === APP_BUILD && last.schema === d.verno) return runs;
    const next = [...runs, { version: APP_VERSION, build: APP_BUILD, schema: d.verno, at: now }].slice(-10);
    await setSetting(RUNS_KEY, next, d);
    return next;
  } catch {
    return [];
  }
}
