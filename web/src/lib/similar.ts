import { albumOrder } from './library';
import { matchesMood, MOODS } from './moods';
import type { Track } from './types';

/**
 * Songs to continue with when the queue runs out. Plain rules over the user's own tags, in this order: the rest of the
 * same album, the same artist, the same genre tag, then the same mood rule. Nothing is invented; with no match the
 * list is empty and the button is not offered.
 */
export function similarTo(current: Track, library: Track[], exclude: Iterable<string> = [], limit = 20): Track[] {
  const skip = new Set(exclude);
  skip.add(current.id);
  const out: Track[] = [];
  const take = (list: Track[]) => {
    for (const t of list) {
      if (out.length >= limit) return;
      if (!skip.has(t.id)) { skip.add(t.id); out.push(t); }
    }
  };
  const loved = (a: Track, b: Track) => b.favorite - a.favorite || b.playCount - a.playCount || a.title.localeCompare(b.title);

  const album = library.filter((t) => t.album === current.album && t.artist === current.artist && current.album !== 'Unknown Album').sort(albumOrder);
  const at = album.findIndex((t) => t.id === current.id);
  take(at >= 0 ? [...album.slice(at + 1), ...album.slice(0, at)] : album);
  if (current.artist !== 'Unknown Artist') take(library.filter((t) => t.artist === current.artist).sort(loved));
  const genre = current.genre?.trim().toLowerCase();
  if (genre) take(library.filter((t) => t.genre?.trim().toLowerCase() === genre).sort(loved));
  for (const m of MOODS) {
    if (m.id !== 'commute' && matchesMood(current, m.id)) take(library.filter((t) => matchesMood(t, m.id)).sort(loved));
  }
  return out;
}
