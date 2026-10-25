import type { LyricLine, Lyrics } from './types';

const TS = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TS = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;
const META = /^\[(ti|ar|al|au|by|re|ve|length|offset|la|id):.*\]$/i;

// ---- cleaning: text metadata headers and decorative separators are not lyrics ----

const HEADER_KEYS = 'title|song|track|artist|album|album artist|performer|singer|composer|lyricist|lyrics by|words by|music by|written by|writer|writers|author|produced by|producer|arranger|arranged by|genre|year|date|released|length|duration|language|lang|source|translated by|translator|synced by|sync by|lrc by|created by|edited by|by|ti|ar|al|au|re|ve';
/** `Title: Name`. The key must be a known header word and a value must follow. */
const HEADER_COLON = new RegExp(`^\\[?\\s*(?:${HEADER_KEYS})\\s*(?::|：)\\s*\\S.*$`, 'i');
/** `Artist - Name`: dash form is accepted only for the core keys, because "Song - ..." could be a real lyric. */
const HEADER_DASH = /^\s*(?:title|artist|album|composer|lyricist)\s[-–—]\s\S.*$/i;
/** Credit lines that may close a lyric sheet. Narrower than the header set so a real lyric is never trimmed. */
const CREDIT_LINE = /^\[?\s*(?:lyrics by|words by|music by|written by|composed by|composer|lyricist|produced by|producer|arranged by|translated by|synced by|lrc by|source|copyright|©)\s*(?::|：|\s[-–—]\s)\s*\S.*$/i;
/** Three or more rule characters and nothing else: ---- ==== **** ____ ~~~~ •••• — — — */
const SEPARATOR = /^[\s\-_=*~#+•·—–─━|]+$/;

export const isSeparatorLine = (line: string) => {
  const t = line.replace(/\s/g, '');
  return t.length >= 3 && SEPARATOR.test(line);
};
const blank = (l: string) => !l.trim();
const isHeader = (l: string) => HEADER_COLON.test(l.trim()) || HEADER_DASH.test(l.trim());

/**
 * Decides, per line, what to do: 'keep', 'drop' (metadata header, trailing credit, leading blank) or 'gap' (a decorative
 * separator inside the song: it becomes a stanza break). Real lyric lines are always kept, including repeated lines,
 * punctuation-only lines such as "..." and bracketed section names like [Chorus].
 */
export function cleanMask(lines: string[]): ('keep' | 'drop' | 'gap')[] {
  const mask: ('keep' | 'drop' | 'gap')[] = lines.map(() => 'keep');
  let i = 0;
  for (; i < lines.length; i++) { // header block: metadata, separators, blanks, until the first real lyric line
    const l = lines[i];
    if (blank(l) || isSeparatorLine(l) || isHeader(l)) mask[i] = 'drop'; else break;
  }
  let j = lines.length - 1;
  for (; j >= i; j--) { // credits block at the end
    const l = lines[j];
    if (blank(l) || isSeparatorLine(l) || CREDIT_LINE.test(l.trim())) mask[j] = 'drop'; else break;
  }
  for (let k = i; k <= j; k++) if (isSeparatorLine(lines[k])) mask[k] = 'gap';
  // never return an empty sheet because of cleaning
  return mask.some((m) => m === 'keep') ? mask : lines.map(() => 'keep');
}

/** Plain text in, clean text out: trimmed lines, one blank line between stanzas. */
export function cleanLyricText(text: string): string {
  const rows = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim());
  const mask = cleanMask(rows);
  const out = rows.flatMap((l, k) => (mask[k] === 'drop' ? [] : mask[k] === 'gap' ? [''] : [l]));
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Same rules for time-synced lines. Dropped lines vanish; separators become silent gaps; repeated gaps collapse. */
export function cleanSyncedLines(lines: LyricLine[]): LyricLine[] {
  const mask = cleanMask(lines.map((l) => l.text));
  const out: LyricLine[] = [];
  lines.forEach((l, k) => {
    if (mask[k] === 'drop') return;
    const text = mask[k] === 'gap' ? '' : l.text;
    if (text === '' && (out.length === 0 || out[out.length - 1].text === '')) return;
    out.push(text === l.text ? l : { t: l.t, text });
  });
  return out;
}

/** What to show for a stored lyric: cleaned on read, so lyrics saved before the cleaner existed look right too. The stored copy is never rewritten. */
export function displayLyrics(l: Lyrics): Lyrics {
  if (l.kind === 'synced') return { ...l, lines: cleanSyncedLines(l.lines ?? []) };
  return { ...l, text: cleanLyricText(l.text ?? '') };
}

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
  if (!lines.length) return { kind: 'plain', text: cleanLyricText(plain.join('\n')) };
  lines.sort((a, b) => a.t - b.t);
  return { kind: 'synced', lines: cleanSyncedLines(lines) };
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

/** Plain lyrics as stanzas (blocks separated by blank lines), each a list of lines. */
export function stanzas(text: string): string[][] {
  return text.split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
}

/** A silent gap longer than this (seconds) is shown as an instrumental break while it is playing. */
export const INTERLUDE_MIN = 5;

/** Seconds a line lasts: until the next line starts (the last line gets a default). */
export function lineSpan(lines: LyricLine[], i: number, fallback = 6): number {
  return i + 1 < lines.length ? lines[i + 1].t - lines[i].t : fallback;
}
