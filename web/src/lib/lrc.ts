import type { LyricLine, LyricWord, Lyrics } from './types';

const TS = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TS = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;
const WORD_TS_PARTS = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

const stampSeconds = (min: string, sec: string, frac?: string) => Number(min) * 60 + Number(sec) + (frac ? Number(frac) / 10 ** frac.length : 0);

/**
 * Enhanced LRC word timing: `<mm:ss.xx>` before a word says when it starts. Text before the first word stamp starts
 * with the line. Returns undefined when the line has no word stamps.
 */
export function parseWords(body: string, lineT: number): LyricWord[] | undefined {
  if (!body.match(WORD_TS)) return undefined;
  const words: LyricWord[] = [];
  let at = lineT, pos = 0;
  // Spacing is kept as written, so syllable stamps (`Hel<00:01.20>lo`) stay one word. A leading space moves to the end
  // of the previous token, so every token ends with its own space and joining them gives the line back.
  const push = (seg: string) => {
    let text = seg.replace(/\s+/g, ' ');
    if (!text.trim()) { if (text && words.length && !words[words.length - 1].text.endsWith(' ')) words[words.length - 1].text += ' '; return; }
    if (text.startsWith(' ')) {
      if (words.length && !words[words.length - 1].text.endsWith(' ')) words[words.length - 1].text += ' ';
      text = text.trimStart();
    }
    words.push({ t: at, text });
  };
  for (const m of body.matchAll(WORD_TS_PARTS)) {
    push(body.slice(pos, m.index));
    at = stampSeconds(m[1], m[2], m[3]);
    pos = (m.index ?? 0) + m[0].length;
  }
  push(body.slice(pos));
  if (!words.length) return undefined;
  words[words.length - 1] = { ...words[words.length - 1], text: words[words.length - 1].text.trimEnd() };
  return words;
}
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
    const body = line.replace(TS, '');
    const text = body.replace(WORD_TS, '').replace(/\s+/g, ' ').trim();
    if (!stamps.length) { plain.push(row.trim()); continue; }
    const t0 = stampSeconds(stamps[0][1], stamps[0][2], stamps[0][3]);
    const words = parseWords(body, t0);
    for (const m of stamps) {
      const t = stampSeconds(m[1], m[2], m[3]);
      // A line sung several times ([00:10][01:20]) reuses its word timing, shifted to each start.
      const shifted = words?.map((w) => ({ t: Math.max(0, w.t + (t - t0) + offset), text: w.text }));
      lines.push(shifted ? { t: Math.max(0, t + offset), text, words: shifted } : { t: Math.max(0, t + offset), text });
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

// ---- karaoke timing ----

export interface TimedWord { text: string; t: number; end: number }

/**
 * When each word of a line is sung. Word-timed lines use their stamps. Line-timed ones spread the line over a
 * plausible singing time (by letter count, never longer than the gap to the next line) so the sweep still reads
 * naturally.
 */
export function wordTimings(line: LyricLine, nextT: number | undefined): TimedWord[] {
  const span = Math.max(0.2, (nextT ?? line.t + 6) - line.t);
  if (line.words?.length) {
    const w = line.words;
    const avg = w.length > 1 ? (w[w.length - 1].t - w[0].t) / (w.length - 1) : 0.6;
    return w.map((x, i) => ({ text: x.text, t: x.t, end: i + 1 < w.length ? w[i + 1].t : Math.min(line.t + span, x.t + Math.max(0.35, avg)) }));
  }
  const parts = line.text.split(/(?<=\s)/).filter(Boolean);
  const letters = parts.reduce((n, p) => n + p.trim().length, 0) || 1;
  const sweep = Math.min(span * 0.9, Math.max(1, letters * 0.07));
  let at = line.t;
  return parts.map((p) => {
    const d = (sweep * p.trim().length) / letters;
    const out = { text: p, t: at, end: at + d };
    at += d;
    return out;
  });
}

/** 0..1 for how much of a word has been sung at `time`. */
export const wordProgress = (w: TimedWord, time: number) => (time <= w.t ? 0 : time >= w.end ? 1 : (time - w.t) / Math.max(w.end - w.t, 0.01));

/** Lyrics timing nudge, in seconds, kept to 0.1 s steps and within ±10 s. */
export const clampOffset = (s: number) => Math.max(-10, Math.min(10, Math.round(s * 10) / 10));
