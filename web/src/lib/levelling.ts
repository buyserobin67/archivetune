import type { Track } from './types';

/** Volume levelling from ReplayGain tags. 'album' keeps the loudness steps between songs of one album. */
export type Levelling = 'off' | 'track' | 'album';
export const LEVELLING_KEY = 'cadence.levelling';

/**
 * Element volume for a track. Only turns loud tracks down (an <audio> element cannot go above 1), and never below 5%.
 * Tracks without tags play at full volume.
 */
export function gainToVolume(gain: Track['gain'], mode: Levelling): number {
  if (mode === 'off' || !gain) return 1;
  const db = mode === 'album' ? gain.album ?? gain.track : gain.track ?? gain.album;
  if (typeof db !== 'number' || !Number.isFinite(db)) return 1;
  return Math.min(1, Math.max(0.05, 10 ** (db / 20)));
}

export function readLevelling(): Levelling {
  try {
    const v = JSON.parse(localStorage.getItem(LEVELLING_KEY) ?? '"off"');
    return v === 'track' || v === 'album' ? v : 'off';
  } catch { return 'off'; }
}

/** iOS Safari ignores `volume` on media elements (the hardware buttons own it), so levelling cannot work there. */
export function canSetVolume(): boolean {
  try {
    const a = new Audio();
    a.volume = 0.5;
    return Math.abs(a.volume - 0.5) < 0.01;
  } catch { return false; }
}
