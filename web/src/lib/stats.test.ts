import { describe, expect, it } from 'vitest';
import { clearListeningHistory, computeRecap, countThreshold, currentStreak, exportStats, formatListening, importStats, ListenTracker, rangeFor, statsSaveStatus } from './stats';
import { makeDb } from './../test/helpers';
import type { PlayEvent } from './types';

const T = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const ev = (trackId: string, at: number, seconds = 200, artist = 'A', title = trackId, album = 'Al'): PlayEvent => ({ trackId, at, seconds, title, artist, album });
const meta = { id: 't1', title: 'Song', artist: 'Art', album: 'Alb', duration: 200 };

function tracker() {
  const rows: PlayEvent[] = [];
  let clock = 1000;
  const tr = new ListenTracker(async (e) => { rows.push(e); return rows.length; }, async (id, s) => { rows[id - 1].seconds = s; }, () => clock++);
  const play = (from: number, to: number) => { for (let t = from; t <= to; t += 0.25) tr.tick(t, true); };
  return { tr, rows, play };
}

describe('listen tracking', () => {
  it('counts after 30 seconds, not before', async () => {
    const { tr, rows, play } = tracker();
    tr.start(meta);
    play(0, 29);
    expect(rows).toHaveLength(0);
    play(29.25, 31);
    await Promise.resolve();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ trackId: 't1', title: 'Song', artist: 'Art', album: 'Alb' });
  });

  it('short songs count at half length, and the threshold helper agrees', () => {
    expect(countThreshold(200)).toBe(30);
    expect(countThreshold(40)).toBe(20);
    expect(countThreshold(2)).toBe(3);
    expect(countThreshold(0)).toBe(30);
  });

  it('counts one listen per start, and a record of the real seconds on flush', async () => {
    const { tr, rows, play } = tracker();
    tr.start(meta);
    play(0, 45);
    await Promise.resolve();
    await tr.flush();
    expect(rows).toHaveLength(1);
    expect(rows[0].seconds).toBeGreaterThan(44);
    expect(rows[0].seconds).toBeLessThanOrEqual(46);
  });

  it('seeking forward does not count as listening', async () => {
    const { tr, rows, play } = tracker();
    tr.start(meta);
    play(0, 10);
    tr.tick(150, true); // jump
    play(150.25, 155);
    await Promise.resolve();
    expect(rows).toHaveLength(0);
  });

  it('paused time does not count, and a skipped song leaves no event', async () => {
    const { tr, rows, play } = tracker();
    tr.start(meta);
    for (let t = 0; t < 100; t += 0.25) tr.tick(t, false);
    play(100, 110);
    tr.start({ ...meta, id: 't2' }); // skipped after ~10 s
    play(0, 5);
    await Promise.resolve();
    expect(rows).toHaveLength(0);
  });

  it('a repeated song counts again after start()', async () => {
    const { tr, rows, play } = tracker();
    tr.start(meta); play(0, 35);
    tr.start(meta); play(0, 35);
    await Promise.resolve();
    expect(rows).toHaveLength(2);
  });
});

describe('periods', () => {
  const anchor = T(2026, 10, 21); // a Wednesday
  it('day, week (Monday start), month and year ranges', () => {
    expect(rangeFor('day', anchor).start).toBe(T(2026, 10, 21, 0));
    expect(rangeFor('week', anchor).start).toBe(T(2026, 10, 19, 0));
    expect(rangeFor('week', anchor).end).toBe(T(2026, 10, 26, 0));
    expect(rangeFor('month', anchor).start).toBe(T(2026, 10, 1, 0));
    expect(rangeFor('month', anchor).end).toBe(T(2026, 11, 1, 0));
    expect(rangeFor('year', anchor).start).toBe(T(2026, 1, 1, 0));
  });
  it('offsets move to earlier periods, across month and year boundaries', () => {
    expect(rangeFor('day', T(2026, 3, 1), -1).start).toBe(T(2026, 2, 28, 0));
    expect(rangeFor('month', T(2026, 1, 15), -1).start).toBe(T(2025, 12, 1, 0));
    expect(rangeFor('year', anchor, -1).start).toBe(T(2025, 1, 1, 0));
    expect(rangeFor('week', anchor, -1).start).toBe(T(2026, 10, 12, 0));
  });
});

describe('recap', () => {
  const events = [
    ev('a', T(2026, 10, 19, 9), 180, 'Nova'), ev('a', T(2026, 10, 19, 20), 180, 'Nova'), ev('b', T(2026, 10, 20, 8), 120, 'Nova'),
    ev('c', T(2026, 10, 21, 8), 240, 'Ember'), ev('c', T(2026, 10, 21, 22), 240, 'Ember'), ev('c', T(2026, 10, 21, 23), 60, 'Ember'),
    ev('old', T(2026, 9, 30, 12), 100, 'Old'),
  ];
  const now = T(2026, 10, 21, 23);

  it('day: only that day, ranked by plays', () => {
    const r = computeRecap(events, 'day', now);
    expect(r.plays).toBe(3);
    expect(r.seconds).toBe(540);
    expect(r.topTracks.map((t) => t.name)).toEqual(['c']);
    expect(r.topArtists[0]).toMatchObject({ name: 'Ember', plays: 3 });
    expect(r.bars).toHaveLength(24);
    expect(r.bars[22].plays).toBe(1);
    expect(r.peak).toBe(8);
  });

  it('week: Monday to Sunday, with per-weekday bars', () => {
    const r = computeRecap(events, 'week', now);
    expect(r.plays).toBe(6);
    expect(r.uniqueTracks).toBe(3);
    expect(r.activeDays).toBe(3);
    expect(r.topArtists.map((a) => a.name)).toEqual(['Ember', 'Nova']);
    expect(r.bars.map((b) => b.plays)).toEqual([2, 1, 3, 0, 0, 0, 0]);
  });

  it('month and year include earlier weeks; previous periods via offset', () => {
    expect(computeRecap(events, 'month', now).plays).toBe(6);
    expect(computeRecap(events, 'year', now).plays).toBe(7);
    expect(computeRecap(events, 'month', now, -1).plays).toBe(1);
    expect(computeRecap(events, 'month', now).bars).toHaveLength(31);
    expect(computeRecap(events, 'year', now).bars[9].plays).toBe(6);
  });

  it('empty periods are empty, not broken', () => {
    const r = computeRecap([], 'week', now);
    expect(r).toMatchObject({ plays: 0, seconds: 0, peak: -1, topTracks: [] });
  });

  it('survives deleted songs because names are stored on the event', () => {
    expect(computeRecap(events, 'day', now).topTracks[0].name).toBe('c');
  });

  it('formats time and computes the streak', () => {
    expect(formatListening(0)).toBe('0 min');
    expect(formatListening(20)).toBe('under a minute');
    expect(formatListening(47 * 60)).toBe('47 min');
    expect(formatListening(3 * 3600 + 12 * 60)).toBe('3 h 12 min');
    expect(currentStreak(events, now)).toBe(3);
    expect(currentStreak(events, T(2026, 10, 23))).toBe(0);
    expect(currentStreak(events, T(2026, 10, 22))).toBe(3);
  });
});

describe('listening history storage', () => {
  it('stores events and clearing history never touches songs', async () => {
    const db = makeDb();
    await db.tracks.put({ id: 'x', hash: 'h', title: 'X', artist: 'A', album: 'B', duration: 10, mime: 'a', size: 1, fileName: 'x', hasArt: false, favorite: 0, addedAt: 1, lastPlayedAt: 0, playCount: 0 });
    await db.plays.add(ev('x', 1));
    await clearListeningHistory(db);
    expect(await db.plays.count()).toBe(0);
    expect(await db.tracks.count()).toBe(1);
  });
});

describe('stats file survives deleting the Home Screen app', () => {
  it('restores minutes, plays and streak into an empty app, matching songs by name after the music is re-imported', async () => {
    const old = makeDb();
    const day = 86_400_000, now = Date.now();
    await old.plays.bulkAdd([0, 1, 2].map((i) => ev(`old-${i}`, now - i * day, 200, 'Nova Vale', 'Tide Study', 'Afterglow')));
    const file = await exportStats(old, now);
    expect((await statsSaveStatus(old)).newSince).toBe(0);

    const reinstalled = makeDb(); // empty: everything was erased
    await reinstalled.tracks.put({ id: 'new-id', hash: 'h', title: 'Tide Study', artist: 'Nova Vale', album: 'Afterglow', duration: 10, mime: 'a', size: 1, fileName: 'x', hasArt: false, favorite: 0, addedAt: 1, lastPlayedAt: 0, playCount: 0 });
    expect(await importStats(file, reinstalled)).toEqual({ added: 3, skipped: 0 });
    const all = await reinstalled.plays.toArray();
    expect(all.every((e) => e.trackId === 'new-id')).toBe(true);
    expect(currentStreak(all, now)).toBe(3);
    const r = computeRecap(all, 'week', now);
    expect(r.seconds).toBeGreaterThan(0);
    expect(computeRecap(all, 'year', now).seconds).toBe(600);
    // importing twice adds nothing
    expect(await importStats(file, reinstalled)).toEqual({ added: 0, skipped: 3 });
  });

  it('keeps history even if the music is not re-imported yet, and rejects other files', async () => {
    const old = makeDb();
    await old.plays.add(ev('x', 5, 100, 'A', 'Song'));
    const fresh = makeDb();
    await importStats(await exportStats(old), fresh);
    expect((await fresh.plays.toArray())[0]).toMatchObject({ title: 'Song', trackId: 'restored:Song' });
    await expect(importStats(new Blob(['{"hello":1}']), fresh)).rejects.toThrow('not a Cadence stats file');
    await expect(importStats(new Blob(['not json']), fresh)).rejects.toThrow('not a Cadence stats file');
  });

  it('counts listens since the last saved copy', async () => {
    const d = makeDb();
    await d.plays.add(ev('x', 1));
    await exportStats(d);
    await d.plays.bulkAdd([ev('y', 2), ev('z', 3)]);
    expect(await statsSaveStatus(d)).toMatchObject({ newSince: 2 });
  });
});
