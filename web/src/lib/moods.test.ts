import { describe, expect, it } from 'vitest';
import { availableMoods, matchesMood, MIN_MOOD_TRACKS, quickPicks, tracksForMood } from './moods';
import { backfillTags } from './backfill';
import { importFile } from './library';
import { audioFile, fakeParser, makeDb } from '../test/helpers';
import type { Track } from './types';

let n = 0;
const t = (o: Partial<Track>): Track => ({ id: `t${n++}`, hash: `h${n}`, title: 'T', artist: 'A', album: 'Al', duration: 200, mime: 'audio/mpeg', size: 1, fileName: 'f', hasArt: false, favorite: 0, addedAt: n, lastPlayedAt: 0, playCount: 0, ...o });

describe('moods', () => {
  it('shows no moods for an empty or untagged library', () => {
    expect(availableMoods([])).toEqual([]);
    expect(availableMoods([t({}), t({}), t({}), t({ genre: '' })])).toEqual([]);
  });

  it('needs enough real matches before a mood appears', () => {
    const lib = [t({ genre: 'Ambient' }), t({ genre: 'Jazz' })];
    expect(availableMoods(lib).map((m) => m.id)).toEqual([]);
    lib.push(t({ genre: 'Classical' }));
    expect(availableMoods(lib).map((m) => m.id)).toEqual(['relax']);
    expect(MIN_MOOD_TRACKS).toBe(3);
  });

  it('matches genre rules and the commute rule', () => {
    expect(matchesMood(t({ genre: 'Hip-Hop' }), 'workout')).toBe(true);
    expect(matchesMood(t({ genre: 'Ambient' }), 'energize')).toBe(false);
    expect(matchesMood(t({ genre: 'Synthpop' }), 'energize')).toBe(true);
    expect(matchesMood(t({ duration: 240, playCount: 1 }), 'commute')).toBe(true);
    expect(matchesMood(t({ duration: 240 }), 'commute')).toBe(false); // never played, not a favorite
    expect(matchesMood(t({ duration: 900, favorite: 1 }), 'commute')).toBe(false); // too long
  });

  it('orders mood tracks by plays', () => {
    const a = t({ genre: 'Rock', playCount: 1 }), b = t({ genre: 'Rock', playCount: 5 });
    expect(tracksForMood([a, b], 'energize')[0]).toBe(b);
  });

  it('quick picks blend sources without duplicates or invented tracks', () => {
    const lib = Array.from({ length: 12 }, (_, i) => t({ playCount: i % 3, favorite: i === 4 ? 1 : 0, lastPlayedAt: i }));
    const picks = quickPicks(lib, 6);
    expect(picks).toHaveLength(6);
    expect(new Set(picks.map((x) => x.id)).size).toBe(6);
    expect(picks.every((p) => lib.includes(p))).toBe(true);
    expect(picks[0].favorite).toBe(1);
    expect(quickPicks([], 6)).toEqual([]);
    expect(quickPicks(lib.slice(0, 2), 6)).toHaveLength(2);
  });
});

describe('tag backfill', () => {
  it('fills genre and embedded lyrics for tracks imported earlier, without touching user lyrics', async () => {
    const db = makeDb();
    const r1 = await importFile(audioFile('a.mp3', 'A'), 'a.mp3', { db, parse: async () => ({ title: 'a' }) });
    const r2 = await importFile(audioFile('b.mp3', 'B'), 'b.mp3', { db, parse: async () => ({ title: 'b' }) });
    if (r1.status !== 'added' || r2.status !== 'added') throw new Error();
    await db.tracks.update(r1.track.id, { genre: undefined });
    await db.tracks.update(r2.track.id, { genre: undefined });
    await db.lyrics.put({ trackId: r2.track.id, kind: 'plain', text: 'mine', source: 'manual' });
    const parse = fakeParser({ genre: 'Ambient', lyrics: { kind: 'plain', text: 'embedded words', source: 'embedded' } });
    expect(await backfillTags({ db, parse })).toBe(2);
    expect((await db.tracks.get(r1.track.id))!.genre).toBe('Ambient');
    expect((await db.lyrics.get(r1.track.id))!.text).toBe('embedded words');
    expect((await db.lyrics.get(r2.track.id))!.text).toBe('mine');
    expect(await backfillTags({ db, parse })).toBe(0); // idempotent
  });

  it('marks tracks without audio so they are not retried forever', async () => {
    const db = makeDb();
    const r = await importFile(audioFile('a.mp3', 'A'), 'a.mp3', { db, parse: async () => ({}) });
    if (r.status !== 'added') throw new Error();
    await db.tracks.update(r.track.id, { genre: undefined });
    await db.blobs.delete(r.track.id);
    await backfillTags({ db, parse: async () => ({}) });
    expect((await db.tracks.get(r.track.id))!.genre).toBe('');
  });
});

describe('tag backfill: disc number and ReplayGain', () => {
  it('re-reads rows from before disc/gain support once, keeping the genre already read', async () => {
    const db = makeDb();
    const r = await importFile(audioFile('a.mp3', 'A'), 'a.mp3', { db, parse: async () => ({ title: 'a', genre: 'Jazz' }) });
    if (r.status !== 'added') throw new Error();
    await db.tracks.update(r.track.id, { tagsV: undefined });
    const parse = fakeParser({ genre: 'Rock', discNo: 2, gain: { track: -7.5 } });
    expect(await backfillTags({ db, parse })).toBe(1);
    const t = (await db.tracks.get(r.track.id))!;
    expect(t.genre).toBe('Jazz');
    expect(t.discNo).toBe(2);
    expect(t.gain).toEqual({ track: -7.5 });
    expect(await backfillTags({ db, parse })).toBe(0);
  });
});
