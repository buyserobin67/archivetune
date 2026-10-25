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

let lastPalette: Palette | null = null;
export const ART_ACCENT_KEY = 'cadence.artAccent';
export const artAccentOn = () => { try { return localStorage.getItem(ART_ACCENT_KEY) === 'true'; } catch { return false; } };

/** Re-applies the current palette after the "Accent from artwork" switch changes. */
export function refreshAccent(): void { if (lastPalette) applyAccent(lastPalette); else applyAccent(DEFAULT_PALETTE); }

export function applyAccent(p: Palette, el: HTMLElement = document.documentElement): void {
  lastPalette = p;
  // Default: the primary accent stays plain white and artwork colours only tint. With the switch on, the accent is the cover's light tone.
  const on = artAccentOn();
  el.style.setProperty('--accent-rgb', on ? rgbCss(p.accentText) : '255 255 255');
  el.style.setProperty('--accent-text-rgb', on ? rgbCss(p.accentText) : '245 245 245');
  el.style.setProperty('--art-rgb', rgbCss(p.accent));
  el.style.setProperty('--art2-rgb', rgbCss(p.accent2));
  el.style.setProperty('--art-text-rgb', rgbCss(p.accentText));
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
