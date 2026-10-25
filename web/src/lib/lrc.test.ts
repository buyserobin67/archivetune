import { describe, expect, it } from 'vitest';
import { baseName, currentLineIndex, isLyricFile, parseLrc, toLyrics } from './lrc';

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
