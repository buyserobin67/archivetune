import { describe, expect, it } from 'vitest';
import { habitOf, learnPatterns, peakSlot, picksFor, rhythmSummary, slotOf } from './rhythm';
import type { PlayEvent, SkipEvent, Track } from './types';

const NOW = new Date(2026, 9, 26, 20, 0).getTime();
const at = (daysAgo: number, hour: number) => { const d = new Date(NOW - daysAgo * 86_400_000); d.setHours(hour, 15, 0, 0); return d.getTime(); };
const play = (trackId: string, daysAgo: number, hour: number): PlayEvent => ({ trackId, at: at(daysAgo, hour), seconds: 200, title: trackId, artist: `A-${trackId}`, album: 'X' });
const skip = (trackId: string, daysAgo: number, hour: number): SkipEvent => ({ trackId, at: at(daysAgo, hour), listened: 5 });
let n = 0;
const track = (id: string, o: Partial<Track> = {}): Track => ({ id, hash: `h${n++}`, title: id, artist: `A-${id}`, album: 'X', duration: 200, mime: 'audio/mpeg', size: 1, fileName: id, hasArt: false, favorite: 0, addedAt: 0, lastPlayedAt: 0, playCount: 0, ...o });

describe('parts of the day', () => {
  it('files hours under morning, afternoon, evening and night', () => {
    const h = (x: number) => slotOf(new Date(2026, 0, 1, x));
    expect([h(4), h(5), h(11), h(12), h(16), h(17), h(21), h(22), h(0)]).toEqual(['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night']);
  });
});

describe('evening music', () => {
  const tracks = [track('calm'), track('gym'), track('once'), track('skipped'), track('everywhere')];
  const plays = [
    ...[1, 2, 4, 6, 9].map((d) => play('calm', d, 21)), play('calm', 3, 9),
    ...[1, 2, 3, 5].map((d) => play('gym', d, 7)),
    play('once', 1, 20),
    ...[1, 2, 3].map((d) => play('skipped', d, 19)),
    ...[1, 2].flatMap((d) => [play('everywhere', d, 8), play('everywhere', d, 14), play('everywhere', d, 19), play('everywhere', d, 23)]),
  ];
  const skips = [1, 2, 3, 4].map((d) => skip('skipped', d, 20));

  it('offers songs you mostly play in the evening, with a readable reason', () => {
    const picks = picksFor('evening', learnPatterns(plays, skips, NOW), tracks);
    expect(picks.map((p) => p.track.id)).toEqual(['calm']);
    expect(picks[0].reason).toBe('5 of your 6 listens were in the evening');
  });

  it('leaves out one-offs, all-day songs and songs you skip at that time', () => {
    const ids = picksFor('evening', learnPatterns(plays, skips, NOW), tracks).map((p) => p.track.id);
    expect(ids).not.toContain('once');
    expect(ids).not.toContain('everywhere');
    expect(ids).not.toContain('skipped');
  });

  it('gives the morning its own songs', () => {
    expect(picksFor('morning', learnPatterns(plays, skips, NOW), tracks).map((p) => p.track.id)).toEqual(['gym']);
  });

  it('lets old habits fade: recent listens outweigh a year-old routine', () => {
    const old = [...[300, 301, 302, 303, 304, 305].map((d) => play('x', d, 21)), ...[1, 2, 3].map((d) => play('x', d, 8))];
    const p = learnPatterns(old, [], NOW).get('x')!;
    expect(p.plays.evening).toBe(6);
    expect(p.weighted.morning).toBeGreaterThan(p.weighted.evening);
    expect(habitOf(p)?.slot).toBe('morning');
  });

  it('describes a habit for the song menu', () => {
    expect(habitOf(learnPatterns(plays, [], NOW).get('calm'))?.text).toBe('Usually in the evening (5 of 6 listens)');
    expect(habitOf(learnPatterns(plays, [], NOW).get('everywhere'))).toBeNull();
  });
});

describe('rhythm summary', () => {
  it('splits listening over the day and names the peak', () => {
    const ev = [play('a', 1, 21), play('a', 2, 21), play('b', 2, 22), play('c', 3, 9)];
    const s = rhythmSummary(ev);
    expect(s.find((x) => x.slot === 'evening')).toMatchObject({ plays: 2, topArtist: 'A-a', topTrack: { title: 'a', artist: 'A-a' } });
    expect(s.find((x) => x.slot === 'night')!.plays).toBe(1);
    expect(peakSlot(s)).toBeNull(); // only 2 evening listens: not enough to call a peak
    expect(peakSlot(rhythmSummary([...ev, play('a', 4, 20)]))).toBe('evening');
  });
});
