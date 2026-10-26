import { describe, expect, it } from 'vitest';
import { looksLikeTtml, parseTtml, ttmlTime } from './ttml';
import { parseLrc, parseLyricsText, syncedFromEntries } from './lrc';

const APPLE = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" itunes:timing="Word">
  <head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head>
  <body dur="3:06.000">
    <div begin="0:12.100" end="0:20.000">
      <p begin="0:12.100" end="0:15.000" ttm:agent="v1"><span begin="0:12.100" end="0:12.500">I'd</span> <span begin="0:12.500" end="0:12.900">find</span> <span begin="0:12.900" end="0:13.400">some</span><span begin="0:13.400" end="0:13.800">one</span> <span begin="0:13.800" end="0:14.500">new</span><span ttm:role="x-bg"><span begin="0:14.6" end="0:15">(new)</span></span></p>
      <p begin="00:00:16.250" end="00:00:18.000">Plain &amp; untimed words</p>
    </div>
  </body>
</tt>`;

describe('TTML lyrics', () => {
  it('recognises TTML and reads its time formats', () => {
    expect(looksLikeTtml(APPLE)).toBe(true);
    expect(looksLikeTtml('[00:01.00]hi')).toBe(false);
    expect(ttmlTime('00:01:02.5')).toBe(62.5);
    expect(ttmlTime('1:02.5')).toBe(62.5);
    expect(ttmlTime('62.5s')).toBe(62.5);
    expect(ttmlTime('1500ms')).toBe(1.5);
    expect(ttmlTime('12.25')).toBe(12.25);
  });

  it('keeps word timing, joins syllables, skips background vocals and decodes entities', () => {
    const [a, b] = parseTtml(APPLE);
    expect(a.t).toBeCloseTo(12.1);
    expect(a.text).toBe("I'd find someone new");
    expect(a.words!.map((w) => w.text).join('')).toBe("I'd find someone new");
    expect(a.words!.map((w) => w.t)).toEqual([12.1, 12.5, 12.9, 13.4, 13.8]);
    expect(b).toEqual({ t: 16.25, text: 'Plain & untimed words' });
  });

  it('goes through the same entry point as LRC', () => {
    const parsed = parseLyricsText(APPLE);
    expect(parsed.kind).toBe('synced');
    expect(parsed.lines).toHaveLength(2);
  });
});

describe('more LRC timestamp styles', () => {
  it('accepts a comma before the hundredths', () => {
    expect(parseLrc('[00:12,50]Comma line').lines).toEqual([{ t: 12.5, text: 'Comma line' }]);
  });

  it('turns lines a tag reader already split into words', () => {
    expect(syncedFromEntries([{ t: 2, text: '<00:02.00>Hey <00:02.40>you' }, { t: 1, text: 'first' }])).toEqual([
      { t: 1, text: 'first' },
      { t: 2, text: 'Hey you', words: [{ t: 2, text: 'Hey ' }, { t: 2.4, text: 'you' }] },
    ]);
  });
});
