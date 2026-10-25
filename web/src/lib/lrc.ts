import type { LyricLine, Lyrics } from './types';

const TS = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TS = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;
const META = /^\[(ti|ar|al|au|by|re|ve|length|offset|la|id):.*\]$/i;

export interface ParsedLyrics { kind: 'synced' | 'plain'; lines?: LyricLine[]; text?: string }

/**
 * Parses LRC text. Handles several timestamps per line, `[offset:+/-ms]`, enhanced
 * word timestamps (stripped), and unsorted input. Without any timestamps the text is
 * returned as plain lyrics.
 */
export function parseLrc(raw: string): ParsedLyrics {
  const input = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let offset = 0;
  const lines: LyricLine[] = [];
  const plain: string[] = [];
  for (const row of input.split('\n')) {
    const line = row.trim();
    const off = /^\[offset:\s*([+-]?\d+)\s*\]$/i.exec(line);
    if (off) { offset = Number(off[1]) / 1000; continue; }
    if (META.test(line)) continue;
    const stamps = [...line.matchAll(TS)];
    const text = line.replace(TS, '').replace(WORD_TS, '').replace(/\s+/g, ' ').trim();
    if (!stamps.length) { plain.push(row.trim()); continue; }
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
      const t = Number(m[1]) * 60 + Number(m[2]) + frac;
      lines.push({ t: Math.max(0, t + offset), text });
    }
  }
  if (!lines.length) return { kind: 'plain', text: plain.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
  lines.sort((a, b) => a.t - b.t);
  return { kind: 'synced', lines };
}

/** Index of the line that is current at `time` (last line whose timestamp has passed), or -1 before the first. */
export function currentLineIndex(lines: LyricLine[], time: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= time + 0.05) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function toLyrics(trackId: string, parsed: ParsedLyrics, source: Lyrics['source']): Lyrics | null {
  if (parsed.kind === 'synced' && parsed.lines?.some((l) => l.text)) return { trackId, kind: 'synced', lines: parsed.lines, source };
  if (parsed.kind === 'plain' && parsed.text?.trim()) return { trackId, kind: 'plain', text: parsed.text, source };
  return null;
}

/** Lyric file names we accept as sidecars. */
export const isLyricFile = (name: string) => /\.(lrc|txt)$/i.test(name);

export const baseName = (name: string) => name.replace(/\.[^.]+$/, '').trim().toLowerCase().replace(/\s+/g, ' ');
