import { describe, expect, it } from 'vitest';
import { filterTracks, sortGroups, sortTracks } from './sort';
import { matchesQuery } from './library';
import type { Track } from './types';

const t = (o: Partial<Track>): Track => ({ id: o.title ?? 'x', hash: o.title ?? 'x', title: 'T', artist: 'A', album: 'Al', duration: 100, mime: 'audio/mpeg', size: 1, fileName: 'f', hasArt: false, favorite: 0, addedAt: 0, lastPlayedAt: 0, playCount: 0, ...o });
const names = (l: Track[]) => l.map((x) => x.title);

describe('sorting and filtering', () => {
  const tracks = [t({ title: 'b track 10', artist: 'Zed', duration: 50, addedAt: 3, playCount: 1 }), t({ title: 'B track 2', artist: 'amy', duration: 300, addedAt: 1, playCount: 9, favorite: 1 }), t({ title: 'a', artist: 'Mo', duration: 100, addedAt: 2 })];
  it('sorts by every key, case- and number-aware', () => {
    expect(names(sortTracks(tracks, 'title'))).toEqual(['a', 'B track 2', 'b track 10']);
    expect(names(sortTracks(tracks, 'artist'))).toEqual(['B track 2', 'a', 'b track 10']);
    expect(names(sortTracks(tracks, 'recent'))).toEqual(['b track 10', 'a', 'B track 2']);
    expect(names(sortTracks(tracks, 'duration'))).toEqual(['B track 2', 'a', 'b track 10']);
    expect(names(sortTracks(tracks, 'plays'))[0]).toBe('B track 2');
  });
  it('does not mutate the input', () => {
    const copy = [...tracks];
    sortTracks(tracks, 'duration');
    expect(tracks).toEqual(copy);
  });
  it('filters by query and favorites', () => {
    expect(names(filterTracks(tracks, { query: 'track', favoritesOnly: false }, matchesQuery))).toHaveLength(2);
    expect(names(filterTracks(tracks, { query: '', favoritesOnly: true }, matchesQuery))).toEqual(['B track 2']);
  });
  it('sorts groups', () => {
    const g = [{ key: '1', name: 'Zeta', subtitle: 'A', trackIds: ['1'] }, { key: '2', name: 'Alpha', subtitle: 'B', trackIds: ['1', '2'] }];
    expect(sortGroups(g, 'name').map((x) => x.name)).toEqual(['Alpha', 'Zeta']);
    expect(sortGroups(g, 'count')[0].name).toBe('Alpha');
    expect(sortGroups(g, 'artist')[0].name).toBe('Zeta');
  });
});
