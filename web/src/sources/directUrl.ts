import type { MusicSource, SourceTrack } from './types';

export interface DirectUrlInput {
  url: string;
  title: string;
  artist: string;
  album?: string;
  licenseName: string;
  licenseUrl?: string;
  sourceUrl?: string;
  /** The person adding the link confirms the rights holder permits downloading. */
  confirmedDownloadAllowed: boolean;
}

/** One user-supplied direct link, accepted only with an explicit rights confirmation. */
export function directUrlTrack(i: DirectUrlInput): SourceTrack {
  return {
    id: 'direct:' + i.url,
    title: i.title.trim(),
    artist: i.artist.trim(),
    album: i.album?.trim() || undefined,
    url: i.url.trim(),
    license: {
      name: i.licenseName.trim(),
      url: i.licenseUrl?.trim() || undefined,
      attribution: i.artist.trim(),
      sourceUrl: i.sourceUrl?.trim() || i.url.trim(),
      sourceId: 'direct-url',
      allowsDownload: i.confirmedDownloadAllowed,
    },
  };
}

export const directUrlSource: MusicSource = {
  id: 'direct-url',
  name: 'Direct link',
  description: 'A direct https link to an audio file you are allowed to download.',
  async list() { return []; },
};
