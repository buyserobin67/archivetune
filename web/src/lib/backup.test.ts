import { describe, expect, it, vi } from 'vitest';
import { exportLibrary, importBackup, tracksMissingAudio } from './backup';
import { importFiles } from './library';
import { addToPlaylist, createPlaylist } from './playlists';
import { StorageQuotaError } from './errors';
import { audioFile, fakeParser, makeDb } from '../test/helpers';

async function seeded() {
  const db = makeDb();
  const { added } = await importFiles(
    [audioFile('a.mp3', 'AAAA'), audioFile('b.mp3', 'BBBBBB')],
    { db, parse: fakeParser({ art: new Blob(['art'], { type: 'image/png' }) }) },
  );
  const p = await createPlaylist('Mix', db);
  await addToPlaylist(p.id, added.map((t) => t.id), db);
  return { db, added, playlist: p };
}

describe('export / import', () => {
  it('round-trips audio, artwork, tracks and playlists into a fresh library', async () => {
    const { db, added, playlist } = await seeded();
    const backup = await exportLibrary({ includeAudio: true, db });
    const fresh = makeDb();
    const r = await importBackup(backup, { db: fresh });
    expect(r).toMatchObject({ tracksAdded: 2, tracksSkipped: 0, audioMissing: 0, playlistsRestored: 1 });
    const t = (await fresh.tracks.get(added[0].id))!;
    expect(t.hash).toBe(added[0].hash);
    expect(await (await fresh.blobs.get(added[1].id))!.blob.text()).toBe('BBBBBB');
    expect(await (await fresh.art.get(added[0].id))!.blob.text()).toBe('art');
    expect((await fresh.playlists.get(playlist.id))!.trackIds).toEqual(added.map((x) => x.id));
  });

  it('is idempotent: importing twice adds nothing new', async () => {
    const { db } = await seeded();
    const backup = await exportLibrary({ includeAudio: true, db });
    const fresh = makeDb();
    await importBackup(backup, { db: fresh });
    const again = await importBackup(backup, { db: fresh });
    expect(again.tracksAdded).toBe(0);
    expect(again.tracksSkipped).toBe(2);
    expect(await fresh.tracks.count()).toBe(2);
    expect((await fresh.playlists.get((await fresh.playlists.toArray())[0].id))!.trackIds).toHaveLength(2);
  });

  it('library-only backup restores metadata and flags missing audio; a full backup later fills it in', async () => {
    const { db } = await seeded();
    const light = await exportLibrary({ includeAudio: false, db });
    const full = await exportLibrary({ includeAudio: true, db });
    expect(light.size).toBeLessThan(full.size);
    const fresh = makeDb();
    const r = await importBackup(light, { db: fresh });
    expect(r.audioMissing).toBe(2);
    expect(await tracksMissingAudio(fresh)).toHaveLength(2);
    await importBackup(full, { db: fresh });
    expect(await tracksMissingAudio(fresh)).toHaveLength(0);
  });

  it('remaps playlist entries onto an existing track with the same hash', async () => {
    const { db, added } = await seeded();
    const backup = await exportLibrary({ includeAudio: true, db });
    const other = makeDb();
    await importFiles([audioFile('a-renamed.mp3', 'AAAA')], { db: other, parse: fakeParser() });
    const existing = (await other.tracks.toArray())[0];
    await importBackup(backup, { db: other });
    const pl = (await other.playlists.toArray())[0];
    expect(pl.trackIds).toContain(existing.id);
    expect(pl.trackIds).not.toContain(added[0].id);
    expect(await other.tracks.count()).toBe(2);
  });

  it('rejects files that are not Cadence backups', async () => {
    await expect(importBackup(new Blob(['hello world, definitely not a backup']), { db: makeDb() })).rejects.toThrow(/not a Cadence backup/);
  });

  it('a quota failure while restoring leaves earlier tracks intact and nothing half-written', async () => {
    const { db } = await seeded();
    const backup = await exportLibrary({ includeAudio: true, db });
    const fresh = makeDb();
    const real = fresh.blobs.put.bind(fresh.blobs);
    let n = 0;
    vi.spyOn(fresh.blobs, 'put').mockImplementation(((...a: Parameters<typeof real>) => (++n === 2 ? Promise.reject(new DOMException('q', 'QuotaExceededError')) : real(...a))) as typeof real);
    await expect(importBackup(backup, { db: fresh })).rejects.toBeInstanceOf(StorageQuotaError);
    expect(await fresh.tracks.count()).toBe(1);
    expect(await fresh.blobs.count()).toBe(1);
  });
});
