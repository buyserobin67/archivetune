import { describe, expect, it } from 'vitest';
import { baseName, currentLineIndex, isLyricFile, parseLrc, toLyrics, wordTimings, wordProgress, clampOffset } from './lrc';

describe('LRC parsing', () => {
  it('parses synced lines and ignores metadata tags', () => {
    const p = parseLrc('[ti:Test]\n[ar:Someone]\n[00:01.50]First\n[00:03.00]Second\n[01:02.5]Third');
    expect(p.kind).toBe('synced');
    expect(p.lines).toEqual([{ t: 1.5, text: 'First' }, { t: 3, text: 'Second' }, { t: 62.5, text: 'Third' }]);
  });

  it('supports several timestamps per line, unsorted input and CRLF', () => {
    const p = parseLrc('[00:10.00]Chorus\r\n[00:02.00][00:20.00]Repeat\r\n[00:05.00]Mid');
    expect(p.lines!.map((l) => [l.t, l.text])).toEqual([[2, 'Repeat'], [5, 'Mid'], [10, 'Chorus'], [20, 'Repeat']]);
  });

  it('applies [offset:] in milliseconds and never goes negative', () => {
    const p = parseLrc('[offset:+500]\n[00:01.00]A\n[00:00.20]B');
    expect(p.lines).toEqual([{ t: 0.7, text: 'B' }, { t: 1.5, text: 'A' }]);
    expect(parseLrc('[offset:-5000]\n[00:01.00]A').lines![0].t).toBe(0);
  });

  it('strips enhanced word timestamps and collapses whitespace', () => {
    expect(parseLrc('[00:01.00]<00:01.00>Hello <00:01.40>  world').lines![0].text).toBe('Hello world');
  });

  it('keeps empty-text lines as timed gaps', () => {
    const p = parseLrc('[00:01.00]A\n[00:05.00]\n[00:09.00]B');
    expect(p.lines!.map((l) => l.text)).toEqual(['A', '', 'B']);
  });

  it('falls back to plain text when there are no timestamps', () => {
    const p = parseLrc('﻿Line one\nLine two\n\n\n\nStanza two');
    expect(p).toEqual({ kind: 'plain', text: 'Line one\nLine two\n\nStanza two' });
  });

  it('finds the current line with a binary search', () => {
    const lines = [{ t: 1, text: 'a' }, { t: 5, text: 'b' }, { t: 9, text: 'c' }];
    expect(currentLineIndex(lines, 0)).toBe(-1);
    expect(currentLineIndex(lines, 1)).toBe(0);
    expect(currentLineIndex(lines, 4.9)).toBe(0);
    expect(currentLineIndex(lines, 5)).toBe(1);
    expect(currentLineIndex(lines, 999)).toBe(2);
    expect(currentLineIndex([], 3)).toBe(-1);
  });

  it('rejects empty lyrics and matches sidecar names', () => {
    expect(toLyrics('t', parseLrc('   '), 'lrc')).toBeNull();
    expect(toLyrics('t', parseLrc('[00:01.00]x'), 'lrc')?.kind).toBe('synced');
    expect(isLyricFile('Song.LRC')).toBe(true);
    expect(isLyricFile('song.mp3')).toBe(false);
    expect(baseName('01  My  Song.MP3')).toBe('01 my song');
  });
});

describe('word-timed (enhanced) LRC', () => {
  it('keeps when each word starts', () => {
    const l = parseLrc('[00:01.00]<00:01.00>Hello <00:01.40>  world <00:02.00>').lines![0];
    expect(l.text).toBe('Hello world');
    expect(l.words).toEqual([{ t: 1, text: 'Hello ' }, { t: 1.4, text: 'world' }]);
  });

  it('starts untimed leading text with the line and shifts repeated lines', () => {
    const lines = parseLrc('[00:10.00][01:10.00]Oh <00:10.50>yeah').lines!;
    expect(lines.map((l) => l.words)).toEqual([
      [{ t: 10, text: 'Oh ' }, { t: 10.5, text: 'yeah' }],
      [{ t: 70, text: 'Oh ' }, { t: 70.5, text: 'yeah' }],
    ]);
  });

  it('leaves plain synced lines without words', () => {
    expect(parseLrc('[00:01.00]Just a line').lines![0].words).toBeUndefined();
  });
});

describe('karaoke timing', () => {
  it('ends each stamped word where the next begins', () => {
    const w = wordTimings({ t: 1, text: 'Hello world', words: [{ t: 1, text: 'Hello ' }, { t: 1.4, text: 'world' }] }, 5);
    expect(w[0]).toEqual({ text: 'Hello ', t: 1, end: 1.4 });
    expect(w[1].t).toBe(1.4);
    expect(w[1].end).toBeGreaterThan(1.4);
    expect(w[1].end).toBeLessThanOrEqual(5);
  });

  it('spreads a line-timed line by letters, inside the gap to the next line', () => {
    const w = wordTimings({ t: 10, text: 'one two three' }, 11);
    expect(w.map((x) => x.text).join('')).toBe('one two three');
    expect(w[0].t).toBe(10);
    expect(w[w.length - 1].end).toBeLessThanOrEqual(10.9 + 1e-9);
    expect(wordProgress(w[0], 9)).toBe(0);
    expect(wordProgress(w[0], 20)).toBe(1);
    expect(wordProgress(w[0], (w[0].t + w[0].end) / 2)).toBeCloseTo(0.5);
  });

  it('keeps the timing nudge in 0.1 s steps and a sane range', () => {
    expect(clampOffset(0.5 + 0.5 + 0.1)).toBe(1.1);
    expect(clampOffset(-25)).toBe(-10);
  });
});

describe('syllable stamps', () => {
  it('keeps a word split by a stamp as one word', () => {
    const l = parseLrc('[00:01.00]Hel<00:01.20>lo <00:01.50>there').lines![0];
    expect(l.text).toBe('Hello there');
    expect(l.words!.map((w) => w.text).join('')).toBe('Hello there');
    expect(l.words).toEqual([{ t: 1, text: 'Hel' }, { t: 1.2, text: 'lo ' }, { t: 1.5, text: 'there' }]);
  });
});

describe('tap to sync', () => {
  it('builds synced lines from taps, a little earlier than tapped, always in order', async () => {
    const { linesFromTaps, linesToSync, toLrcText, TAP_LEAD } = await import('./lrc');
    const lines = linesToSync('One\nTwo\n\nThree');
    expect(lines).toEqual(['One', 'Two', 'Three']);
    const synced = linesFromTaps(lines, [1, 3.5, 3.4]);
    expect(synced[0].t).toBeCloseTo(1 - TAP_LEAD);
    expect(synced[1].t).toBeCloseTo(3.5 - TAP_LEAD);
    expect(synced[2].t).toBeGreaterThan(synced[1].t);
    expect(linesFromTaps(lines, [0.05])).toEqual([{ t: 0, text: 'One' }]);
    expect(toLrcText([{ t: 65.5, text: 'Hi' }])).toBe('[01:05.50]Hi\n');
    expect(parseLrc(toLrcText(synced)).lines!.map((l) => l.text)).toEqual(lines);
  });
});
