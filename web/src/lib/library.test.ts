import { describe, expect, it } from 'vitest';
import { importFile, importFiles, deleteTrack, searchTracks, groupAlbums, toggleFavorite, markPlayed } from './library';
import { titleFromFileName } from './metadata';
import { audioFile, fakeParser, makeDb } from '../test/helpers';

describe('importing audio', () => {
  it('stores track metadata, audio blob and artwork', async () => {
    const db = makeDb();
    const art = new Blob(['png-bytes'], { type: 'image/png' });
    const r = await importFile(audioFile('song.mp3', 'AAA'), 'song.mp3', { db, parse: fakeParser({ title: 'Hello', artist: 'Ada', album: 'First', duration: 61, art }) });
    expect(r.status).toBe('added');
    if (r.status !== 'added') return;
    expect(r.track).toMatchObject({ title: 'Hello', artist: 'Ada', album: 'First', duration: 61, hasArt: true, favorite: 0 });
    expect(r.track.hash).toMatch(/^[0-9a-f]{64}$/);
    const blob = await db.blobs.get(r.track.id);
    expect(await blob!.blob.text()).toBe('AAA');
    expect((await db.art.get(r.track.id))!.blob.size).toBe(art.size);
  });

  it('falls back to the file name when tags are missing', async () => {
    const db = makeDb();
    const r = await importFile(audioFile('03 - Night_Drive.m4a', 'B', 'audio/mp4'), '03 - Night_Drive.m4a', { db, parse: async () => ({}) });
    expect(r.status === 'added' && r.track).toMatchObject({ title: 'Night Drive', artist: 'Unknown Artist', album: 'Unknown Album', hasArt: false });
  });

  it('accepts mp3, m4a, wav and rejects non-audio', async () => {
    const db = makeDb();
    const s = await importFiles(
      [audioFile('a.mp3', '1'), audioFile('b.m4a', '2', 'audio/mp4'), audioFile('c.wav', '3', 'audio/wav'), audioFile('notes.txt', '4', 'text/plain'), audioFile('noext', '5', '')],
      { db, parse: fakeParser() },
    );
    expect(s.added).toHaveLength(3);
    expect(s.failed.map((f) => f.name)).toEqual(['noext']);
    expect(s.lyricsUnmatched).toEqual(['notes.txt']); // .txt is treated as a lyric sidecar, and nothing matched it
  });

  it('guesses a mime type from the extension when Files gives none', async () => {
    const db = makeDb();
    const r = await importFile(audioFile('x.flac', 'f', ''), 'x.flac', { db, parse: fakeParser() });
    expect(r.status === 'added' && r.track.mime).toBe('audio/flac');
  });

  it('reports progress', async () => {
    const db = makeDb();
    const calls: number[] = [];
    await importFiles([audioFile('a.mp3', '1'), audioFile('b.mp3', '2')], { db, parse: fakeParser(), onProgress: (d) => calls.push(d) });
    expect(calls).toEqual([0, 1, 2]);
  });

  it('title cleaner handles track numbers and underscores', () => {
    expect(titleFromFileName('01. Song_Name.mp3')).toBe('Song Name');
    expect(titleFromFileName('Song.mp3')).toBe('Song');
  });
});

describe('deduplication', () => {
  it('skips identical bytes even under a different file name', async () => {
    const db = makeDb();
    const a = await importFile(audioFile('one.mp3', 'SAME-BYTES'), 'one.mp3', { db, parse: fakeParser() });
    const b = await importFile(audioFile('copy of one.mp3', 'SAME-BYTES'), 'copy of one.mp3', { db, parse: fakeParser() });
    expect(a.status).toBe('added');
    expect(b.status).toBe('duplicate');
    expect(await db.tracks.count()).toBe(1);
    expect(await db.blobs.count()).toBe(1);
  });

  it('dedupes inside one batch and across batches', async () => {
    const db = makeDb();
    const s1 = await importFiles([audioFile('a.mp3', 'X'), audioFile('b.mp3', 'X'), audioFile('c.mp3', 'Y')], { db, parse: fakeParser() });
    expect(s1.added).toHaveLength(2);
    expect(s1.duplicates).toHaveLength(1);
    const s2 = await importFiles([audioFile('a.mp3', 'X'), audioFile('d.mp3', 'Z')], { db, parse: fakeParser() });
    expect(s2.added).toHaveLength(1);
    expect(s2.duplicates).toHaveLength(1);
    expect(await db.tracks.count()).toBe(3);
  });

  it('different bytes with the same name are both kept', async () => {
    const db = makeDb();
    await importFile(audioFile('a.mp3', '1'), 'a.mp3', { db, parse: fakeParser() });
    await importFile(audioFile('a.mp3', '2'), 'a.mp3', { db, parse: fakeParser() });
    expect(await db.tracks.count()).toBe(2);
  });
});

describe('library queries', () => {
  it('searches title, artist and album, all words must match', async () => {
    const db = makeDb();
    await importFile(audioFile('1.mp3', '1'), '1.mp3', { db, parse: fakeParser({ title: 'Blue Monday', artist: 'New Order', album: 'Power' }) });
    await importFile(audioFile('2.mp3', '2'), '2.mp3', { db, parse: fakeParser({ title: 'Red Light', artist: 'Siouxsie', album: 'Kaleidoscope' }) });
    expect((await searchTracks('blue', db)).map((t) => t.title)).toEqual(['Blue Monday']);
    expect((await searchTracks('order monday', db)).map((t) => t.title)).toEqual(['Blue Monday']);
    expect((await searchTracks('kaleido', db)).map((t) => t.title)).toEqual(['Red Light']);
    expect(await searchTracks('nothing-here', db)).toHaveLength(0);
    expect(await searchTracks('', db)).toHaveLength(2);
  });

  it('groups albums, favorites and recently played', async () => {
    const db = makeDb();
    const r = await importFile(audioFile('1.mp3', '1'), '1.mp3', { db, parse: fakeParser({ album: 'A', trackNo: 2 }) });
    await importFile(audioFile('2.mp3', '2'), '2.mp3', { db, parse: fakeParser({ album: 'A', trackNo: 1 }) });
    if (r.status !== 'added') throw new Error();
    const all = await db.tracks.toArray();
    const g = groupAlbums(all);
    expect(g).toHaveLength(1);
    expect(g[0].trackIds).toHaveLength(2);
    await toggleFavorite(r.track.id, db);
    expect((await db.tracks.where('favorite').equals(1).toArray()).map((t) => t.id)).toEqual([r.track.id]);
    await markPlayed(r.track.id, db);
    const t = (await db.tracks.get(r.track.id))!;
    expect(t.playCount).toBe(1);
    expect(t.lastPlayedAt).toBeGreaterThan(0);
  });

  it('deleting a track removes audio, art and playlist references', async () => {
    const db = makeDb();
    const r = await importFile(audioFile('1.mp3', '1'), '1.mp3', { db, parse: fakeParser({ art: new Blob(['x']) }) });
    if (r.status !== 'added') throw new Error();
    await db.playlists.put({ id: 'p', name: 'P', trackIds: [r.track.id], createdAt: 0, updatedAt: 0 });
    await deleteTrack(r.track.id, db);
    expect(await db.tracks.count()).toBe(0);
    expect(await db.blobs.count()).toBe(0);
    expect(await db.art.count()).toBe(0);
    expect((await db.playlists.get('p'))!.trackIds).toEqual([]);
  });
});
