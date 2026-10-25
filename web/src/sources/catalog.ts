import type { MusicSource, SourceTrack } from './types';

/**
 * Catalog JSON format (host it anywhere that sends CORS headers):
 * { "name": "My free music", "tracks": [
 *   { "id": "1", "title": "...", "artist": "...", "album": "...", "url": "https://.../a.mp3",
 *     "license": { "name": "CC BY 4.0", "url": "https://creativecommons.org/licenses/by/4.0/",
 *                  "attribution": "Artist Name", "sourceUrl": "https://...", "allowsDownload": true } } ] }
 */
export function parseCatalog(json: unknown, sourceId: string): SourceTrack[] {
  const tracks = (json as { tracks?: unknown })?.tracks;
  if (!Array.isArray(tracks)) throw new Error('Catalog has no "tracks" array.');
  const out: SourceTrack[] = [];
  for (const raw of tracks) {
    const t = raw as Record<string, any>;
    if (typeof t?.url !== 'string' || typeof t?.title !== 'string' || typeof t?.artist !== 'string') continue;
    const l = t.license ?? {};
    out.push({
      id: String(t.id ?? t.url),
      title: t.title,
      artist: t.artist,
      album: typeof t.album === 'string' ? t.album : undefined,
      url: t.url,
      license: {
        name: String(l.name ?? ''),
        url: typeof l.url === 'string' ? l.url : undefined,
        attribution: String(l.attribution ?? t.artist),
        sourceUrl: typeof l.sourceUrl === 'string' ? l.sourceUrl : undefined,
        sourceId,
        // Anything other than an explicit `true` is treated as "not permitted".
        allowsDownload: l.allowsDownload === true,
      },
    });
  }
  return out;
}

export function catalogSource(url: string, fetchImpl: typeof fetch = fetch): MusicSource {
  const id = 'catalog:' + url;
  return {
    id,
    name: 'Catalog',
    description: url,
    async list(signal) {
      const res = await fetchImpl(url, { signal, credentials: 'omit' });
      if (!res.ok) throw new Error(`Catalog request failed (HTTP ${res.status}).`);
      return parseCatalog(await res.json(), id);
    },
    async search(q, signal) {
      const all = await this.list(signal);
      const n = q.toLowerCase();
      return all.filter((t) => `${t.title} ${t.artist} ${t.album ?? ''}`.toLowerCase().includes(n));
    },
  };
}
