import type { Track } from './types';
import type { Group } from './library';

export type SongSort = 'title' | 'artist' | 'recent' | 'duration' | 'plays';
export type GroupSort = 'name' | 'artist' | 'count';

export const SONG_SORTS: [SongSort, string][] = [
  ['title', 'Title'], ['artist', 'Artist'], ['recent', 'Recently added'], ['duration', 'Duration'], ['plays', 'Most played'],
];
export const GROUP_SORTS: [GroupSort, string][] = [['name', 'Name'], ['artist', 'Artist'], ['count', 'Song count']];

const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

export function sortTracks(tracks: Track[], by: SongSort): Track[] {
  const t = [...tracks];
  switch (by) {
    case 'artist': return t.sort((a, b) => cmp(a.artist, b.artist) || cmp(a.album, b.album) || (a.trackNo ?? 0) - (b.trackNo ?? 0) || cmp(a.title, b.title));
    case 'recent': return t.sort((a, b) => b.addedAt - a.addedAt);
    case 'duration': return t.sort((a, b) => b.duration - a.duration);
    case 'plays': return t.sort((a, b) => b.playCount - a.playCount || cmp(a.title, b.title));
    default: return t.sort((a, b) => cmp(a.title, b.title));
  }
}

export function sortGroups(groups: Group[], by: GroupSort): Group[] {
  const g = [...groups];
  if (by === 'artist') return g.sort((a, b) => cmp(a.subtitle, b.subtitle) || cmp(a.name, b.name));
  if (by === 'count') return g.sort((a, b) => b.trackIds.length - a.trackIds.length || cmp(a.name, b.name));
  return g.sort((a, b) => cmp(a.name, b.name));
}

export interface TrackFilter { query: string; favoritesOnly: boolean }

export function filterTracks(tracks: Track[], f: TrackFilter, matches: (t: Track, q: string) => boolean): Track[] {
  return tracks.filter((t) => (!f.favoritesOnly || t.favorite === 1) && matches(t, f.query));
}
