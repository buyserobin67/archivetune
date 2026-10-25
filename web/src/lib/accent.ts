import { useEffect, useState } from 'react';
import { DEFAULT_PALETTE, getArtPalette, rgbCss, seedPalette, type Palette } from './palette';
import type { Track } from './types';

/** Synchronous best guess (seeded from the album name) so the UI never flashes the default. */
export function fallbackPalette(track: Pick<Track, 'album' | 'artist'> | null): Palette {
  return track ? seedPalette(`${track.album}|${track.artist}`) : DEFAULT_PALETTE;
}

/** Palette for a track: artwork colours when available, a seeded fallback otherwise. */
export function useTrackPalette(track: Track | null): Palette {
  const [palette, setPalette] = useState<Palette>(() => fallbackPalette(track));
  useEffect(() => {
    let live = true;
    setPalette(fallbackPalette(track));
    if (track?.hasArt) void getArtPalette(track.id).then((p) => { if (live && p) setPalette(p); });
    return () => { live = false; };
  }, [track?.id, track?.hasArt, track?.album, track?.artist]);
  return palette;
}

export function applyAccent(p: Palette, el: HTMLElement = document.documentElement): void {
  el.style.setProperty('--accent-rgb', rgbCss(p.accent));
  el.style.setProperty('--accent2-rgb', rgbCss(p.accent2));
  el.style.setProperty('--accent-text-rgb', rgbCss(p.accentText));
  el.style.setProperty('--tint-rgb', rgbCss(p.tint));
}

/** Keeps the document-level accent variables in sync with the playing track. Mount once. */
export function useGlobalAccent(track: Track | null): Palette {
  const p = useTrackPalette(track);
  useEffect(() => { applyAccent(p); }, [p]);
  return p;
}

/** Palette for any cover (album, artist, playlist) addressed by one of its tracks. */
export function useArtPalette(trackId: string | undefined, seed: string): Palette {
  const [palette, setPalette] = useState<Palette>(() => seedPalette(seed));
  useEffect(() => {
    let live = true;
    setPalette(seedPalette(seed));
    if (trackId) void getArtPalette(trackId).then((p) => { if (live && p) setPalette(p); });
    return () => { live = false; };
  }, [trackId, seed]);
  return palette;
}

export function useArtThumb(trackId: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (trackId) void import('./palette').then((m) => m.getArtThumb(trackId)).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [trackId]);
  return url;
}
