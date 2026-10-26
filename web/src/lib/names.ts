import type { PlayEvent, Track } from './types';

/**
 * Display-only clean-up of names from video sites ("Artist - Topic", "ArtistVEVO", "Song (Official Video)").
 * Stored tags are never rewritten: turn the setting off and the original names come back.
 */
export const CLEAN_NAMES_KEY = 'cadence.cleanNames';

export function cleanNamesOn(): boolean {
  try { return localStorage.getItem(CLEAN_NAMES_KEY) !== 'false'; } catch { return true; }
}

const ARTIST_SUFFIX = /\s*(?:-\s*Topic|VEVO|\s-\s*Official(?:\s+(?:Channel|Artist))?|\(Official\)|Official Channel)\s*$/i;

// Video-site extras inside () or [] (or after " | "), never part of the song name.
const NOISE_WORDS = [
  'official\\s+(?:music\\s+|lyric\\s+|lyrics\\s+)?(?:video|audio|visuali[sz]er|clip)(?:\\s+(?:hd|hq|4k))?',
  'official', 'lyric\\s+video', 'lyrics?(?:\\s+video)?', 'audio(?:\\s+only)?', 'music\\s+video', 'visuali[sz]er',
  'video\\s+oficial', 'clip\\s+officiel', 'hd', 'hq', '4k', 'high\\s+quality', '[0-9]{3,4}p', 'explicit', 'clean',
];
const NOISE = new RegExp(`\\s*[([](?:${NOISE_WORDS.join('|')})[)\\]]`, 'gi');
const BAR_TAIL = new RegExp(`\\s*[|｜]\\s*(?:${NOISE_WORDS.join('|')})\\s*$`, 'i');

export function cleanArtist(artist: string): string {
  const out = artist.replace(ARTIST_SUFFIX, '').trim();
  return out || artist;
}

/** Also drops a leading "Artist - " that video titles repeat. */
export function cleanTitle(title: string, artist?: string): string {
  let out = title.replace(NOISE, '').replace(BAR_TAIL, '').replace(/\s{2,}/g, ' ').trim();
  const a = artist ? cleanArtist(artist) : '';
  if (a) {
    const lower = out.toLowerCase(), prefix = a.toLowerCase();
    for (const sep of [' - ', ' – ', ' — ', ': ']) {
      if (lower.startsWith(prefix + sep) && out.length > prefix.length + sep.length) { out = out.slice(prefix.length + sep.length).trim(); break; }
    }
  }
  return out || title;
}

/** The track as the app shows it. Same object when nothing changes. */
export function displayTrack<T extends Track | undefined>(t: T, on = cleanNamesOn()): T {
  if (!t || !on) return t;
  const artist = cleanArtist(t.artist);
  const title = cleanTitle(t.title, t.artist);
  return artist === t.artist && title === t.title ? t : { ...t, artist, title };
}

export function displayEvent(e: PlayEvent, on = cleanNamesOn()): PlayEvent {
  if (!on) return e;
  const artist = cleanArtist(e.artist);
  const title = cleanTitle(e.title, e.artist);
  return artist === e.artist && title === e.title ? e : { ...e, artist, title };
}
