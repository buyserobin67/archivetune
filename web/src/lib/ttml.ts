import type { LyricLine, LyricWord } from './types';

/**
 * TTML lyrics, the format Apple Music uses for word-timed lyrics. Each <p begin=…> is a line; <span begin=…> inside it
 * are words or syllables. Background vocals (ttm:role="x-bg") are left out, as they would read as stray words here.
 * Small, dependency-free and tolerant: no DOMParser, so it also runs in tests and workers.
 */

export const looksLikeTtml = (text: string) => /^\s*(?:<\?xml[^>]*>\s*)?<tt[\s>]/i.test(text.replace(/^﻿/, ''));

/** "00:01:02.345", "01:02.345", "62.345", "62.3s", "62345ms", "1.5m". Seconds, or NaN. */
export function ttmlTime(v: string | undefined): number {
  if (!v) return NaN;
  const s = v.trim();
  let m = /^(\d+(?:\.\d+)?)(h|m|s|ms)$/.exec(s);
  if (m) return Number(m[1]) * ({ h: 3600, m: 60, s: 1, ms: 0.001 } as const)[m[2] as 'h' | 'm' | 's' | 'ms'];
  m = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return /^\d+(?:\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1] ?? new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag)?.[1];

const decode = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

/** Removes background-vocal spans, nested spans included. */
function dropBackground(xml: string): string {
  let out = xml;
  for (let guard = 0; guard < 500; guard++) {
    const start = out.search(/<span\b[^>]*role\s*=\s*["']x-bg["'][^>]*>/i);
    if (start < 0) break;
    const re = /<span\b[^>]*>|<\/span>/gi;
    re.lastIndex = start;
    let depth = 0, end = -1;
    for (let m = re.exec(out); m; m = re.exec(out)) {
      depth += m[0].startsWith('</') ? -1 : 1;
      if (depth === 0) { end = m.index + m[0].length; break; }
    }
    out = end < 0 ? out.slice(0, start) : out.slice(0, start) + out.slice(end);
  }
  return out;
}

export function parseTtml(raw: string): LyricLine[] {
  const xml = dropBackground(raw.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, ''));
  // A global offset some exporters write on <body> or <div>: ignored unless it is a plain begin on the body.
  const lines: LyricLine[] = [];
  for (const p of xml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
    const t = ttmlTime(attr(p[1], 'begin'));
    if (!Number.isFinite(t)) continue;
    const words: LyricWord[] = [];
    let text = '';
    const inner = p[2].replace(/<br\s*\/?>/gi, ' ');
    // Tokens: a timed span, plain text between spans, or any other tag (ignored).
    for (const tok of inner.matchAll(/<span\b([^>]*)>([^<]*)<\/span>|([^<]+)|<[^>]*>/gi)) {
      if (tok[1] !== undefined) {
        const wt = ttmlTime(attr(tok[1], 'begin'));
        const w = decode(tok[2]).replace(/\s+/g, ' ');
        if (!w.trim()) { if (words.length && !words[words.length - 1].text.endsWith(' ')) words[words.length - 1].text += ' '; continue; }
        const lead = w.startsWith(' ');
        if (lead && words.length && !words[words.length - 1].text.endsWith(' ')) words[words.length - 1].text += ' ';
        words.push({ t: Number.isFinite(wt) ? wt : words.length ? words[words.length - 1].t : t, text: lead ? w.trimStart() : w });
      } else if (tok[3] !== undefined) {
        const gap = decode(tok[3]).replace(/\s+/g, ' ');
        if (!gap.trim()) { if (words.length && !words[words.length - 1].text.endsWith(' ')) words[words.length - 1].text += ' '; continue; }
        // untimed text inside a line: it starts with the line, or with the word before it
        words.push({ t: words.length ? words[words.length - 1].t : t, text: gap.trimStart() });
      }
    }
    if (words.length) words[words.length - 1].text = words[words.length - 1].text.trimEnd();
    text = words.map((w) => w.text).join('').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const timed = /<span\b[^>]*\bbegin\s*=/i.test(inner);
    lines.push(timed ? { t, text, words } : { t, text });
  }
  return lines.sort((a, b) => a.t - b.t);
}
