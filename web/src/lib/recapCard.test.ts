import { describe, expect, it } from 'vitest';
import { recapCardText } from './recapCard';
import { computeRecap } from './stats';
import type { PlayEvent } from './types';

const ev = (o: Partial<PlayEvent>): PlayEvent => ({ trackId: 't', at: 0, seconds: 600, title: 'Song', artist: 'Artist', album: 'Album', ...o });

describe('recap card text', () => {
  it('names the period, top artist, time and top songs', () => {
    const now = new Date(2026, 9, 21, 12).getTime();
    const plays = [
      ev({ at: now - 1000, title: 'One', artist: 'Nova Vale' }),
      ev({ at: now - 2000, title: 'One', artist: 'Nova Vale' }),
      ev({ at: now - 3000, title: 'Two', artist: 'Other' }),
    ];
    const t = recapCardText(computeRecap(plays, 'week', now), 'week');
    expect(t.eyebrow.startsWith('My week in music')).toBe(true);
    expect(t.top).toBe('Nova Vale');
    expect(t.time).toBe('30 min');
    expect(t.stats).toBe('3 plays  ·  2 songs  ·  2 artists');
    expect(t.songs).toEqual(['1  One · Nova Vale', '2  Two · Other']);
  });

  it('uses singular counts', () => {
    const now = new Date(2026, 9, 21, 12).getTime();
    const t = recapCardText(computeRecap([ev({ at: now - 1000 })], 'day', now), 'day');
    expect(t.stats).toBe('1 play  ·  1 song  ·  1 artist');
  });
});
