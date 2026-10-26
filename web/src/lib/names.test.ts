import { describe, expect, it } from 'vitest';
import { cleanArtist, cleanTitle, displayTrack } from './names';
import type { Track } from './types';

describe('name clean-up', () => {
  it('drops video-site artist suffixes', () => {
    expect(cleanArtist('Bo Staloch - Topic')).toBe('Bo Staloch');
    expect(cleanArtist('TaylorSwiftVEVO')).toBe('TaylorSwift');
    expect(cleanArtist('Adele - Official')).toBe('Adele');
    expect(cleanArtist('Topic')).toBe('Topic'); // never empty
    expect(cleanArtist('The Topics')).toBe('The Topics');
  });

  it('drops video extras from titles but keeps real ones', () => {
    expect(cleanTitle('Your Eyes Tell Stories (Official Video)')).toBe('Your Eyes Tell Stories');
    expect(cleanTitle('Song [Lyrics]')).toBe('Song');
    expect(cleanTitle('Song (Official Music Video) [HD]')).toBe('Song');
    expect(cleanTitle('Song | Official Audio')).toBe('Song');
    expect(cleanTitle('Song (Acoustic)')).toBe('Song (Acoustic)');
    expect(cleanTitle('Song (feat. Someone)')).toBe('Song (feat. Someone)');
    expect(cleanTitle('Song (Live at Wembley)')).toBe('Song (Live at Wembley)');
    expect(cleanTitle('Audio')).toBe('Audio');
  });

  it('drops a repeated "Artist - " prefix', () => {
    expect(cleanTitle('Bo Staloch - Your Eyes Tell Stories', 'Bo Staloch - Topic')).toBe('Your Eyes Tell Stories');
    expect(cleanTitle('Bo Staloch - ', 'Bo Staloch')).toBe('Bo Staloch -');
  });

  it('can be switched off and keeps the object when nothing changes', () => {
    const t = { id: 'a', title: 'Song (Official Video)', artist: 'X - Topic' } as Track;
    expect(displayTrack(t, false)).toBe(t);
    expect(displayTrack(t, true)).toMatchObject({ title: 'Song', artist: 'X' });
    const clean = { id: 'b', title: 'Song', artist: 'X' } as Track;
    expect(displayTrack(clean, true)).toBe(clean);
  });
});
