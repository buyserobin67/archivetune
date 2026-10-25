import type { ParsedMeta } from './types';

export type MetaParser = (file: Blob, fileName: string) => Promise<ParsedMeta>;

/** Reads tags + embedded artwork with music-metadata (loaded lazily so it stays out of the main bundle). */
export const parseTags: MetaParser = async (file) => {
  try {
    const { parseBlob, selectCover } = await import('music-metadata');
    const m = await parseBlob(file, { skipPostHeaders: true });
    const pic = selectCover(m.common.picture);
    return {
      title: m.common.title,
      artist: m.common.artist ?? m.common.albumartist,
      album: m.common.album,
      duration: m.format.duration,
      trackNo: m.common.track?.no ?? undefined,
      art: pic ? new Blob([new Uint8Array(pic.data)], { type: pic.format || 'image/jpeg' }) : undefined,
    };
  } catch {
    return {};
  }
};

/** Fallback title from a file name: "01 - Song_Name.mp3" -> "Song Name". */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  const cleaned = base.replace(/^\s*\d{1,3}\s*[-._)]\s*/, '').replace(/[_]+/g, ' ').trim();
  return cleaned || base || 'Untitled';
}

const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', mp4: 'audio/mp4', wav: 'audio/wav', wave: 'audio/wav',
  flac: 'audio/flac', aif: 'audio/aiff', aiff: 'audio/aiff', caf: 'audio/x-caf', ogg: 'audio/ogg', opus: 'audio/ogg', weba: 'audio/webm',
};

export function guessMime(file: { name: string; type: string }): string {
  if (file.type && file.type.startsWith('audio/')) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? file.type ?? 'application/octet-stream';
}

export function looksLikeAudio(file: { name: string; type: string }): boolean {
  if (file.type.startsWith('audio/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext in MIME_BY_EXT;
}
