import type { LicenseInfo } from '../lib/types';

/** A track a source offers. It must carry explicit permission to download, plus attribution. */
export interface SourceTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  /** Direct URL to an audio file. */
  url: string;
  license: LicenseInfo & { allowsDownload: boolean };
}

/**
 * A place music can be fetched from. Implementations must only expose files whose
 * license explicitly permits downloading. No stream ripping, no DRM circumvention.
 */
export interface MusicSource {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  list(signal?: AbortSignal): Promise<SourceTrack[]>;
  search?(query: string, signal?: AbortSignal): Promise<SourceTrack[]>;
}
