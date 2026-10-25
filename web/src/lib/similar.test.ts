import { describe, expect, it } from 'vitest';
import { similarTo } from './similar';
import type { Track } from './types';

let n = 0;
const t = (o: Partial<Track>): Track => ({ id: `t${n++}`, hash: `h${n}`, title: `T${n}`, artist: 'A', album: 'Al', duration: 200, mime: 'audio/mpeg', size: 1, fileName: 'f', hasArt: false, favorite: 0, addedAt: n, lastPlayedAt: 0, playCount: 0, ...o });

describe('similarTo', () => {
  it('continues the album first, then the artist, then the genre and mood', () => {
    const a1 = t({ album: 'X', trackNo: 1 }), a2 = t({ album: 'X', trackNo: 2 }), a3 = t({ album: 'X', trackNo: 3 });
    const sameArtist = t({ album: 'Y' });
    const sameGenre = t({ artist: 'B', album: 'Z', genre: 'Jazz' });
    const sameMood = t({ artist: 'C', album: 'W', genre: 'Ambient' });
    const unrelated = t({ artist: 'D', album: 'V', genre: 'Metal' });
    a2.genre = 'Jazz';
    const lib = [unrelated, sameMood, sameGenre, sameArtist, a3, a1, a2];
    expect(similarTo(a2, lib).map((x) => x.id)).toEqual([a3.id, a1.id, sameArtist.id, sameGenre.id, sameMood.id]);
  });

  it('skips songs already queued and never returns the current one', () => {
    const cur = t({ album: 'X' }), other = t({ album: 'X' }), queued = t({ album: 'X' });
    expect(similarTo(cur, [cur, other, queued], [queued.id]).map((x) => x.id)).toEqual([other.id]);
  });

  it('returns nothing rather than inventing a match', () => {
    const cur = t({ artist: 'Unknown Artist', album: 'Unknown Album' });
    expect(similarTo(cur, [cur, t({ artist: 'Q', album: 'R' })])).toEqual([]);
  });

  it('respects the limit', () => {
    const lib = Array.from({ length: 30 }, () => t({ album: 'Big' }));
    expect(similarTo(lib[0], lib, [], 5)).toHaveLength(5);
  });
});
