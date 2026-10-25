import { describe, expect, it } from 'vitest';
import { cleanLyricText, cleanSyncedLines, displayLyrics, INTERLUDE_MIN, isSeparatorLine, lineSpan, parseLrc, stanzas, toLyrics } from './lrc';

// The reference: lyrics that opened with these text headers before the cleaner existed.
const REFERENCE = `Title: Ember
Artist: The Test Artist
Album: Test Album

I walk through the quiet night
Counting every light

I walk through the quiet night
Counting every light`;

describe('metadata headers are not lyrics', () => {
  it('removes Title / Artist / Album from the top of plain lyrics and keeps every lyric line', () => {
    const t = cleanLyricText(REFERENCE);
    expect(t).toBe('I walk through the quiet night\nCounting every light\n\nI walk through the quiet night\nCounting every light');
    expect(t).not.toMatch(/Title|Artist|Album/);
  });

  it('keeps repeated lines and intentional punctuation', () => {
    const src = 'Title: X\n\nNo, no, no!\nNo, no, no!\n...\nWhy?!\n(oh-oh-oh)\n— and then —\nHold on...';
    expect(cleanLyricText(src)).toBe('No, no, no!\nNo, no, no!\n...\nWhy?!\n(oh-oh-oh)\n— and then —\nHold on...');
  });

  it('handles other common header keys, colon variants and CRLF', () => {
    const src = 'Ti: A\r\nar:B\r\nAlbum： C\r\nComposer: D\r\nLyricist - E\r\nLength: 3:41\r\n\r\nFirst line\r\nSecond line';
    expect(cleanLyricText(src)).toBe('First line\nSecond line');
  });

  it('only strips headers at the top: a lyric that merely looks like one later in the song stays', () => {
    const src = 'First line\nTitle: of my heart\nLast line';
    expect(cleanLyricText(src)).toBe(src);
  });

  it('a first lyric line that is not key: value is never mistaken for a header', () => {
    expect(cleanLyricText('Artist of the night\nTitle waves')).toBe('Artist of the night\nTitle waves');
    expect(cleanLyricText('Song - for you\nlala')).toBe('Song - for you\nlala');
  });

  it('strips trailing credits but not ordinary last lines', () => {
    expect(cleanLyricText('Line\nEnd line\n\nWritten by: Someone\nSource: example.com')).toBe('Line\nEnd line');
    expect(cleanLyricText('Line\nWritten in the stars')).toBe('Line\nWritten in the stars');
  });

  it('never returns an empty sheet because of cleaning', () => {
    expect(cleanLyricText('Title: Only a header')).toBe('Title: Only a header');
  });
});

describe('decorative separators', () => {
  it('recognises rule lines but not lyrics', () => {
    for (const s of ['----', '=====', '***', '____', '~~~~~', '• • •', '— — —', '---------------', '─────', '#####']) expect(isSeparatorLine(s)).toBe(true);
    for (const s of ['...', '??', '!!!', '-', '--', 'a---', '- hello -', 'la la la', '']) expect(isSeparatorLine(s)).toBe(false);
  });

  it('drops them from headers and footers and turns inner ones into stanza breaks', () => {
    const src = '==========\nTitle: X\nArtist: Y\n==========\n\nVerse one\nline two\n* * *\nVerse two\nline two\n----------\n';
    expect(cleanLyricText(src)).toBe('Verse one\nline two\n\nVerse two\nline two');
  });
});

describe('empty lines and verses', () => {
  it('collapses runs of blank lines to one stanza break and trims the ends', () => {
    expect(cleanLyricText('\n\n A \n B \n\n\n\n\n C \n\n')).toBe('A\nB\n\nC');
  });

  it('splits stanzas for display', () => {
    expect(stanzas('A\nB\n\nC\n\n\nD\nE')).toEqual([['A', 'B'], ['C'], ['D', 'E']]);
  });

  it('long lines are preserved whole (wrapping is the view\'s job)', () => {
    const long = 'word '.repeat(80).trim();
    expect(cleanLyricText(`Title: x\n\n${long}`)).toBe(long);
  });
});

describe('plain text and LRC through the parser', () => {
  it('parseLrc cleans plain text and does not invent timestamps', () => {
    const p = parseLrc(REFERENCE);
    expect(p.kind).toBe('plain');
    expect(p.text).toBe(cleanLyricText(REFERENCE));
    expect(p.lines).toBeUndefined();
  });

  it('LRC: metadata tags, a timed Title line and separators are dropped; real lines keep their times', () => {
    const lrc = '[ti:Ember]\n[ar:A]\n[al:B]\n[by:me]\n[offset:0]\n[00:00.00]Title: Ember\n[00:00.50]Artist: A\n[00:01.00]----------\n[00:02.00]First\n[00:04.00]First\n[00:06.00]***\n[00:08.00]Second';
    const p = parseLrc(lrc);
    expect(p.kind).toBe('synced');
    expect(p.lines).toEqual([{ t: 2, text: 'First' }, { t: 4, text: 'First' }, { t: 6, text: '' }, { t: 8, text: 'Second' }]);
  });

  it('a plain-text file never becomes synced lyrics', () => {
    expect(toLyrics('t', parseLrc('Just words\nNo times'), 'lrc')).toMatchObject({ kind: 'plain' });
    expect(toLyrics('t', parseLrc('Title: x\n\n'), 'lrc')).toMatchObject({ kind: 'plain' });
  });

  it('offset tag shifts every line and clamps at zero', () => {
    expect(parseLrc('[offset:+1000]\n[00:01.00]A').lines).toEqual([{ t: 2, text: 'A' }]);
    expect(parseLrc('[offset:-3000]\n[00:01.00]A\n[00:05.00]B').lines).toEqual([{ t: 0, text: 'A' }, { t: 2, text: 'B' }]);
  });

  it('synced cleaning drops leading/duplicate gaps', () => {
    expect(cleanSyncedLines([{ t: 0, text: '' }, { t: 1, text: 'A' }, { t: 5, text: '' }, { t: 6, text: '' }, { t: 9, text: 'B' }])).toEqual([{ t: 1, text: 'A' }, { t: 5, text: '' }, { t: 9, text: 'B' }]);
  });

  it('instrumental gaps are measurable', () => {
    const lines = [{ t: 1, text: 'A' }, { t: 3, text: '' }, { t: 20, text: 'B' }];
    expect(lineSpan(lines, 1)).toBeGreaterThan(INTERLUDE_MIN);
    expect(lineSpan(lines, 0)).toBe(2);
    expect(lineSpan(lines, 2)).toBe(6);
  });
});

describe('already-stored lyrics are cleaned on read, not rewritten', () => {
  it('displayLyrics returns a cleaned copy and leaves the stored object alone', () => {
    const stored = { trackId: 't', kind: 'plain' as const, text: REFERENCE, source: 'lrc' as const };
    const shown = displayLyrics(stored);
    expect(shown.text).not.toMatch(/^Title:/);
    expect(stored.text.startsWith('Title: Ember')).toBe(true);
    const synced = { trackId: 't', kind: 'synced' as const, lines: [{ t: 0, text: 'Title: X' }, { t: 2, text: 'Hi' }], source: 'lrc' as const };
    expect(displayLyrics(synced).lines).toEqual([{ t: 2, text: 'Hi' }]);
    expect(synced.lines).toHaveLength(2);
  });
});
