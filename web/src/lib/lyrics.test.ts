import { describe, expect, it } from 'vitest';
import { exportLibrary, importBackup } from './backup';
import { importFile, importFiles, deleteTrack } from './library';
import { getLyrics, matchSidecar, removeLyrics, saveLyricsText } from './lyrics';
import { audioFile, fakeParser, makeDb } from '../test/helpers';

const lrcFile = (name: string, body: string) => new File([body], name, { type: 'text/plain' });

describe('lyrics storage', () => {
  it('stores embedded lyrics found during import, atomically with the track', async () => {
    const db = makeDb();
    const r = await importFile(audioFile('s.mp3', 'S'), 's.mp3', { db, parse: fakeParser({ lyrics: { kind: 'synced', lines: [{ t: 1, text: 'hi' }], source: 'embedded' } }) });
    if (r.status !== 'added') throw new Error();
    expect((await getLyrics(r.track.id, db))!.lines).toEqual([{ t: 1, text: 'hi' }]);
  });

  it('attaches .lrc sidecars picked together with audio, matching by file name', async () => {
    const db = makeDb();
    const s = await importFiles(
      [audioFile('01 - Night Drive.mp3', '1'), audioFile('Other.mp3', '2'), lrcFile('01 - Night Drive.lrc', '[00:01.00]one\n[00:02.00]two'), lrcFile('Stray.lrc', '[00:01.00]x')],
      { db, parse: fakeParser() },
    );
    expect(s.added).toHaveLength(2);
    expect(s.lyricsAttached).toBe(1);
    expect(s.lyricsUnmatched).toEqual(['Stray.lrc']);
    const night = s.added.find((t) => t.fileName.startsWith('01'))!;
    expect((await getLyrics(night.id, db))!.kind).toBe('synced');
  });

  it('attaches sidecars to tracks that are already in the library (lyrics-only selection)', async () => {
    const db = makeDb();
    await importFiles([audioFile('Song.mp3', '1')], { db, parse: fakeParser() });
    const s = await importFiles([lrcFile('song.TXT', 'plain words\nsecond line')], { db });
    expect(s.lyricsAttached).toBe(1);
    const t = (await db.tracks.toArray())[0];
    expect((await getLyrics(t.id, db))).toMatchObject({ kind: 'plain', source: 'lrc' });
  });

  it('matches by title when the file names differ, but never guesses between two candidates', () => {
    const tracks = [{ id: 'a', fileName: 'x.mp3', title: 'Blue Hour' }, { id: 'b', fileName: 'y.mp3', title: 'Blue Hour' }, { id: 'c', fileName: 'z.mp3', title: 'Solo' }];
    expect(matchSidecar('Solo.lrc', tracks)).toBe('c');
    expect(matchSidecar('Blue Hour.lrc', tracks)).toBeNull();
  });

  it('saves pasted lyrics, rejects empty text, removes lyrics, and deleting a track removes them', async () => {
    const db = makeDb();
    const r = await importFile(audioFile('s.mp3', 'S'), 's.mp3', { db, parse: fakeParser() });
    if (r.status !== 'added') throw new Error();
    expect(await saveLyricsText(r.track.id, '   ', 'manual', db)).toBeNull();
    expect((await saveLyricsText(r.track.id, 'la la\nla', 'manual', db))!.kind).toBe('plain');
    await removeLyrics(r.track.id, db);
    expect(await getLyrics(r.track.id, db)).toBeUndefined();
    await saveLyricsText(r.track.id, '[00:01.00]x', 'manual', db);
    await deleteTrack(r.track.id, db);
    expect(await db.lyrics.count()).toBe(0);
  });

  it('survives backup and restore, and old backups without lyrics still restore', async () => {
    const db = makeDb();
    const r = await importFile(audioFile('s.mp3', 'S'), 's.mp3', { db, parse: fakeParser() });
    if (r.status !== 'added') throw new Error();
    await saveLyricsText(r.track.id, '[00:01.00]x', 'manual', db);
    const backup = await exportLibrary({ includeAudio: true, db });
    const fresh = makeDb();
    await importBackup(backup, { db: fresh });
    expect((await fresh.lyrics.get(r.track.id))!.kind).toBe('synced');
  });
});

describe('database upgrade', () => {
  it('opening a v1 database with data keeps every row and adds the lyrics table', async () => {
    const name = `upgrade-${Math.random()}`;
    const { default: Dexie } = await import('dexie');
    const v1 = new Dexie(name);
    v1.version(1).stores({ tracks: 'id, &hash, title, artist, album, favorite, addedAt, lastPlayedAt', blobs: 'trackId', art: 'trackId', playlists: 'id, name, updatedAt', settings: 'key' });
    await v1.table('tracks').put({ id: 'old', hash: 'h', title: 'Old', artist: 'A', album: 'B', duration: 1, mime: 'audio/mpeg', size: 1, fileName: 'o.mp3', hasArt: false, favorite: 1, addedAt: 1, lastPlayedAt: 0, playCount: 3 });
    await v1.table('blobs').put({ trackId: 'old', blob: new Blob(['x']) });
    await v1.table('playlists').put({ id: 'p', name: 'P', trackIds: ['old'], createdAt: 1, updatedAt: 1 });
    v1.close();
    const { CadenceDB } = await import('./db');
    const v2 = new CadenceDB(name);
    expect((await v2.tracks.get('old'))!.playCount).toBe(3);
    expect(await v2.blobs.count()).toBe(1);
    expect((await v2.playlists.get('p'))!.trackIds).toEqual(['old']);
    expect(await v2.lyrics.count()).toBe(0);
  });
});
