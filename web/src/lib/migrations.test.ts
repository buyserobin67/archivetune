import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { CadenceDB, openDatabase, readStoredVersion, recordAppRun, SCHEMA_VERSION } from './db';
import { exportLibrary, importBackup } from './backup';

let n = 0;
const name = () => `mig-${Date.now()}-${n++}-${Math.random().toString(36).slice(2)}`;

/** Creates a database exactly as an older release of Cadence did (the frozen v1 / v2 schema), with data in it. */
async function seedOld(dbName: string, version: 1 | 2 | 3 | 4) {
  const old = new Dexie(dbName);
  old.version(1).stores({
    tracks: 'id, &hash, title, artist, album, favorite, addedAt, lastPlayedAt', blobs: 'trackId', art: 'trackId', playlists: 'id, name, updatedAt', settings: 'key',
  });
  if (version >= 2) old.version(2).stores({ lyrics: 'trackId' });
  if (version >= 3) old.version(3).stores({ artEdits: 'trackId' });
  if (version >= 4) old.version(4).stores({ plays: '++id, at, trackId' });
  await old.open();
  for (let i = 0; i < 5; i++) {
    const id = `t${i}`;
    await old.table('tracks').put({ id, hash: `h${i}`, title: `Song ${i}`, artist: 'A', album: 'B', duration: 100, mime: 'audio/mpeg', size: 4, favorite: i === 1, addedAt: i, playCount: i });
    await old.table('blobs').put({ trackId: id, blob: new Blob([`audio-${i}`], { type: 'audio/mpeg' }) });
    await old.table('art').put({ trackId: id, blob: new Blob([`art-${i}`], { type: 'image/png' }) });
  }
  await old.table('playlists').put({ id: 'p1', name: 'Mix', trackIds: ['t0', 't2', 't4'], createdAt: 1, updatedAt: 2 });
  await old.table('settings').bulkPut([{ key: 'queue', value: { ids: ['t3', 't1'], index: 1 } }, { key: 'volume', value: 0.4 }, { key: 'history', value: ['t2', 't0'] }]);
  if (version >= 2) await old.table('lyrics').put({ trackId: 't0', kind: 'plain', text: 'la la' });
  if (version >= 4) await old.table('plays').add({ trackId: 't2', at: 1000, seconds: 120, title: 'Song 2', artist: 'A', album: 'B' });
  old.close();
}

async function assertLibraryIntact(d: CadenceDB, lyrics: boolean) {
  expect(await d.tracks.count()).toBe(5);
  expect((await d.tracks.get('t1'))!.favorite).toBe(true);
  for (let i = 0; i < 5; i++) {
    expect(await (await d.blobs.get(`t${i}`))!.blob.text()).toBe(`audio-${i}`);
    expect(await (await d.art.get(`t${i}`))!.blob.text()).toBe(`art-${i}`);
  }
  expect((await d.playlists.get('p1'))!.trackIds).toEqual(['t0', 't2', 't4']);
  expect((await d.settings.get('queue'))!.value).toEqual({ ids: ['t3', 't1'], index: 1 });
  expect((await d.settings.get('history'))!.value).toEqual(['t2', 't0']);
  expect((await d.settings.get('volume'))!.value).toBe(0.4);
  if (lyrics) expect((await d.lyrics.get('t0'))!.text).toBe('la la');
}

describe('database migrations keep your library', () => {
  for (const from of [1, 2, 3, 4] as const) {
    it(`v${from} database opens in the current build with every row and Blob intact`, async () => {
      const dbName = name();
      await seedOld(dbName, from);
      expect(await readStoredVersion(dbName)).toBe(from);
      const d = new CadenceDB(dbName);
      const r = await openDatabase(d);
      expect(r).toMatchObject({ ok: true, from, to: SCHEMA_VERSION });
      await assertLibraryIntact(d, from >= 2);
      // the stores added later exist and are empty, ready to use
      expect(await d.artEdits.count()).toBe(0);
      // the listening log survives (v4 had one); the skip log is new and empty
      expect(await d.plays.count()).toBe(from >= 4 ? 1 : 0);
      expect(await d.skips.count()).toBe(0);
      expect(await readStoredVersion(dbName)).toBe(SCHEMA_VERSION);
      d.close();
    });
  }

  it('upgrading a COPY leaves the original untouched', async () => {
    const src = name(), copy = name();
    await seedOld(src, 1);
    // copy v1 -> separate database
    const a = new Dexie(src);
    a.version(1).stores({ tracks: 'id, &hash, title, artist, album, favorite, addedAt, lastPlayedAt', blobs: 'trackId', art: 'trackId', playlists: 'id, name, updatedAt', settings: 'key' });
    const b = new Dexie(copy);
    b.version(1).stores({ tracks: 'id, &hash, title, artist, album, favorite, addedAt, lastPlayedAt', blobs: 'trackId', art: 'trackId', playlists: 'id, name, updatedAt', settings: 'key' });
    for (const t of ['tracks', 'blobs', 'art', 'playlists', 'settings']) await b.table(t).bulkPut(await a.table(t).toArray());
    a.close(); b.close();
    const upgraded = new CadenceDB(copy);
    expect((await openDatabase(upgraded)).ok).toBe(true);
    upgraded.close();
    expect(await readStoredVersion(src)).toBe(1);
    expect(await readStoredVersion(copy)).toBe(SCHEMA_VERSION);
  });

  it('a fresh install reports no previous version and starts at the current schema', async () => {
    const d = new CadenceDB(name());
    expect(await readStoredVersion(d.name)).toBeNull();
    expect(await openDatabase(d)).toMatchObject({ ok: true, from: null, to: SCHEMA_VERSION });
    d.close();
  });

  it('a database from a NEWER build is never downgraded or deleted (old tab/cached shell after a newer deploy)', async () => {
    const dbName = name();
    await seedOld(dbName, 3);
    const future = new Dexie(dbName);
    future.version(3).stores({ tracks: 'id, &hash, title, artist, album, favorite, addedAt, lastPlayedAt', blobs: 'trackId', art: 'trackId', playlists: 'id, name, updatedAt', settings: 'key', lyrics: 'trackId', artEdits: 'trackId' });
    future.version(4).stores({ plays: '++id, at, trackId' });
    future.version(5).stores({ skips: '++id, at, trackId' });
    future.version(6).stores({ extra: 'id' });
    await future.open();
    future.close();
    const d = new CadenceDB(dbName);
    const r = await openDatabase(d);
    // Dexie 4 opens a newer database as it is; if a browser reports VersionError instead, the app shows the recovery screen.
    if (r.ok) await assertLibraryIntact(d, true); else expect(r.reason).toBe('newer');
    d.close();
    expect(await readStoredVersion(dbName)).toBe(6);
  });

  it('upgrades are additive: every old store keeps its original index definition', () => {
    const d = new CadenceDB(name());
    const tracks = d.table('tracks').schema;
    expect(tracks.primKey.name).toBe('id');
    expect(tracks.indexes.map((i) => i.name).sort()).toEqual(['addedAt', 'album', 'artist', 'favorite', 'hash', 'lastPlayedAt', 'title']);
    expect(d.tables.map((t) => t.name).sort()).toEqual(['art', 'artEdits', 'blobs', 'lyrics', 'playlists', 'plays', 'settings', 'skips', 'tracks']);
  });

  it('records which builds opened the library, without growing forever', async () => {
    const d = new CadenceDB(name());
    await openDatabase(d);
    const a = await recordAppRun(d, 1);
    expect(a).toHaveLength(1);
    expect(await recordAppRun(d, 2)).toHaveLength(1); // same build: no new entry
    d.close();
  });

  it('a backup made on this version restores into a database upgraded from v1', async () => {
    const dbName = name();
    await seedOld(dbName, 1);
    const d = new CadenceDB(dbName);
    await openDatabase(d);
    const backup = await exportLibrary({ includeAudio: true, db: d });
    const fresh = new CadenceDB(name());
    const r = await importBackup(backup, { db: fresh });
    expect(r.tracksAdded).toBe(5);
    expect(await (await fresh.blobs.get('t3'))!.blob.text()).toBe('audio-3');
  });

  it('old backups without app/lyrics fields still restore', async () => {
    const d = new CadenceDB(name());
    await openDatabase(d);
    const manifest = { version: 1, exportedAt: 1, includesAudio: false, tracks: [{ track: { id: 'x', hash: 'hx', title: 'X', artist: 'A', album: 'B', duration: 1, mime: 'audio/mpeg', size: 1, favorite: false, addedAt: 1 } }], playlists: [] };
    const json = new TextEncoder().encode(JSON.stringify(manifest));
    const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, json.length);
    const r = await importBackup(new Blob(['CADENCE1\n', len, json]), { db: d });
    expect(r.tracksAdded).toBe(1);
  });
});
