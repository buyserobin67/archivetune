import { importFile, type ImportOutcome } from '../lib/library';
import type { CadenceDB } from '../lib/db';
import { parseTags, type MetaParser } from '../lib/metadata';
import type { SourceTrack } from './types';

/** Hosts we refuse outright: they stream under terms that do not allow saving files. */
const BLOCKED_HOSTS = [
  'youtube.com', 'youtu.be', 'googlevideo.com', 'spotify.com', 'scdn.co', 'music.apple.com', 'applemusic.com',
  'tidal.com', 'deezer.com', 'soundcloud.com', 'amazon.com', 'music.amazon', 'pandora.com',
];

export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceError';
  }
}

export function assertDownloadable(t: SourceTrack): URL {
  if (!t.license?.allowsDownload) throw new SourceError('This track does not state that downloading is permitted.');
  if (!t.license.name?.trim() || !t.license.attribution?.trim()) throw new SourceError('License name and artist attribution are required.');
  let url: URL;
  try { url = new URL(t.url); } catch { throw new SourceError('That is not a valid URL.'); }
  if (url.protocol !== 'https:') throw new SourceError('Only https:// links can be downloaded.');
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
    throw new SourceError('Streaming services are not supported. Only files that explicitly permit downloading can be added.');
  }
  return url;
}

export interface DownloadOptions {
  db?: CadenceDB;
  parse?: MetaParser;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** Fetches an authorised file into the local library, keeping attribution and license with the track. */
export async function downloadSourceTrack(t: SourceTrack, opts: DownloadOptions = {}): Promise<ImportOutcome> {
  const url = assertDownloadable(t);
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(url.href, { signal: opts.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new SourceError('Download failed. The server may be offline or may not allow cross-origin downloads (CORS).');
  }
  if (!res.ok) throw new SourceError(`Download failed (HTTP ${res.status}).`);
  const type = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (type && !type.startsWith('audio/') && type !== 'application/octet-stream' && type !== 'video/mp4') {
    throw new SourceError(`The link does not point to an audio file (${type}).`);
  }
  const blob = await res.blob();
  const name = decodeURIComponent(url.pathname.split('/').pop() || t.title) || t.title;
  const file = new File([blob], /\.[a-z0-9]{2,5}$/i.test(name) ? name : `${t.title}.mp3`, { type: type.startsWith('audio/') ? type : '' });
  const outcome = await importFile(file, file.name, {
    db: opts.db,
    parse: async (b, n) => {
      const meta = await (opts.parse ?? parseTags)(b, n);
      // The source's declared metadata wins: it is what the rights holder published.
      return { ...meta, title: t.title || meta.title, artist: t.artist || meta.artist, album: t.album || meta.album };
    },
    license: t.license,
  });
  return outcome;
}
