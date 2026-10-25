import { describe, expect, it } from 'vitest';
import { CadenceDB } from './db';
import { addToPlaylist, createPlaylist, deletePlaylist, movePlaylistTrack, removeFromPlaylist, renamePlaylist } from './playlists';
import { makeDb } from '../test/helpers';

describe('playlist persistence', () => {
  it('survives closing and reopening the database', async () => {
    const db = makeDb();
    const p = await createPlaylist('Road trip', db);
    await addToPlaylist(p.id, ['a', 'b', 'c'], db);
    await db.settings.put({ key: 'x', value: 1 });
    db.close();

    const reopened = new CadenceDB(db.name);
    const got = await reopened.playlists.get(p.id);
    expect(got).toMatchObject({ name: 'Road trip', trackIds: ['a', 'b', 'c'] });
    reopened.close();
  });

  it('does not add the same track twice', async () => {
    const db = makeDb();
    const p = await createPlaylist('P', db);
    expect(await addToPlaylist(p.id, ['a', 'a', 'b'], db)).toBe(2);
    expect(await addToPlaylist(p.id, ['b', 'c'], db)).toBe(1);
    expect((await db.playlists.get(p.id))!.trackIds).toEqual(['a', 'b', 'c']);
  });

  it('renames, reorders, removes and deletes', async () => {
    const db = makeDb();
    const p = await createPlaylist('  ', db);
    expect(p.name).toBe('New Playlist');
    await renamePlaylist(p.id, 'Mix', db);
    await addToPlaylist(p.id, ['a', 'b', 'c'], db);
    await movePlaylistTrack(p.id, 0, 2, db);
    expect((await db.playlists.get(p.id))!.trackIds).toEqual(['b', 'c', 'a']);
    await movePlaylistTrack(p.id, 0, 9, db); // out of range: ignored
    await removeFromPlaylist(p.id, 'c', db);
    const cur = (await db.playlists.get(p.id))!;
    expect(cur.name).toBe('Mix');
    expect(cur.trackIds).toEqual(['b', 'a']);
    await deletePlaylist(p.id, db);
    expect(await db.playlists.count()).toBe(0);
  });

  it('adding to a missing playlist is a no-op', async () => {
    expect(await addToPlaylist('nope', ['a'], makeDb())).toBe(0);
  });
});
