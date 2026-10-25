import type { Track } from './types';

export type MoodId = 'energize' | 'relax' | 'workout' | 'commute';
export const MIN_MOOD_TRACKS = 3;

export interface Mood { id: MoodId; label: string; why: string }

/**
 * Moods are plain, inspectable rules over the user's own library data (genre tags, play history,
 * length). Nothing is analysed server-side and nothing is invented: a mood only appears when at
 * least MIN_MOOD_TRACKS real tracks match it.
 */
export const MOODS: Mood[] = [
  { id: 'energize', label: 'Energize', why: 'Pop, rock, dance, funk and similar genre tags' },
  { id: 'relax', label: 'Relax', why: 'Ambient, classical, jazz, acoustic and similar genre tags' },
  { id: 'workout', label: 'Workout', why: 'Electronic, hip-hop, metal and other high-tempo genre tags' },
  { id: 'commute', label: 'Commute', why: 'Songs of 2 to 6 minutes that you have played or favorited' },
];

const GENRES: Record<'energize' | 'relax' | 'workout', RegExp> = {
  energize: /\b(pop|rock|dance|funk|disco|electro|house|indie|punk|ska|latin|reggaeton|afrobeat|synth)/i,
  relax: /\b(ambient|classical|jazz|chill|acoustic|lounge|new age|piano|blues|lo-?fi|downtempo|instrumental|folk|soul|bossa|easy|sleep|meditat)/i,
  workout: /\b(house|techno|trance|edm|drum|bass|dnb|dubstep|hip|rap|trap|metal|punk|dance|electronic|hardcore|gym)/i,
};

export function matchesMood(t: Track, mood: MoodId): boolean {
  if (mood === 'commute') return t.duration >= 120 && t.duration <= 360 && (t.playCount > 0 || t.favorite === 1);
  return !!t.genre && GENRES[mood].test(t.genre);
}

export function tracksForMood(tracks: Track[], mood: MoodId): Track[] {
  return tracks.filter((t) => matchesMood(t, mood)).sort((a, b) => b.playCount - a.playCount || b.addedAt - a.addedAt);
}

/** Only moods with enough real matches are offered. */
export function availableMoods(tracks: Track[]): Mood[] {
  return MOODS.filter((m) => tracksForMood(tracks, m.id).length >= MIN_MOOD_TRACKS);
}

/**
 * Quick Picks: a deterministic blend of what the user plays, loves and added lately.
 * Alternates favorites / most played / newest so one source can't crowd out the others.
 */
export function quickPicks(tracks: Track[], limit = 10): Track[] {
  const byPlays = [...tracks].filter((t) => t.playCount > 0).sort((a, b) => b.playCount - a.playCount || b.lastPlayedAt - a.lastPlayedAt);
  const favs = tracks.filter((t) => t.favorite === 1).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt || b.addedAt - a.addedAt);
  const fresh = [...tracks].sort((a, b) => b.addedAt - a.addedAt);
  const out: Track[] = [];
  const seen = new Set<string>();
  const lists = [favs, byPlays, fresh];
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const t = l[i];
      if (t && !seen.has(t.id) && out.length < limit) { seen.add(t.id); out.push(t); }
    }
  }
  return out;
}
