import { describe, expect, it, vi } from 'vitest';
import { parseCatalog } from './catalog';
import { directUrlTrack } from './directUrl';
import { assertDownloadable, downloadSourceTrack } from './download';
import { fakeParser, makeDb } from '../test/helpers';

const input = { url: 'https://example.org/song.mp3', title: 'Song', artist: 'Ada', licenseName: 'CC BY 4.0', confirmedDownloadAllowed: true };
const okFetch = (type = 'audio/mpeg', body = 'AUDIO') => vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': type } })) as unknown as typeof fetch;

describe('licensed downloads', () => {
  it('downloads an authorised file and keeps attribution and license', async () => {
    const db = makeDb();
    const r = await downloadSourceTrack(directUrlTrack({ ...input, licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', sourceUrl: 'https://example.org/page' }), { db, fetchImpl: okFetch(), parse: fakeParser({ title: 'tag title' }) });
    expect(r.status).toBe('added');
    const t = (await db.tracks.toArray())[0];
    expect(t.title).toBe('Song'); // rights holder's metadata wins
    expect(t.artist).toBe('Ada');
    expect(t.license).toMatchObject({ name: 'CC BY 4.0', attribution: 'Ada', sourceUrl: 'https://example.org/page', url: 'https://creativecommons.org/licenses/by/4.0/' });
    expect((await db.blobs.get(t.id))!.blob.size).toBe(5);
  });

  it('refuses without explicit permission', () => {
    expect(() => assertDownloadable(directUrlTrack({ ...input, confirmedDownloadAllowed: false }))).toThrow(/does not state that downloading is permitted/);
  });

  it('requires a license name and attribution', () => {
    expect(() => assertDownloadable(directUrlTrack({ ...input, licenseName: ' ' }))).toThrow(/License name/);
    expect(() => assertDownloadable(directUrlTrack({ ...input, artist: ' ' }))).toThrow(/License name/);
  });

  it.each([
    'https://www.youtube.com/watch?v=1', 'https://youtu.be/x', 'https://open.spotify.com/track/1', 'https://rr1---sn.googlevideo.com/a',
    'https://music.apple.com/x', 'https://soundcloud.com/a/b',
  ])('blocks streaming services: %s', (url) => {
    expect(() => assertDownloadable(directUrlTrack({ ...input, url }))).toThrow(/Streaming services/);
  });

  it('only allows https and valid URLs', () => {
    expect(() => assertDownloadable(directUrlTrack({ ...input, url: 'http://example.org/a.mp3' }))).toThrow(/https/);
    expect(() => assertDownloadable(directUrlTrack({ ...input, url: 'not a url' }))).toThrow(/valid URL/);
  });

  it('never fetches when the track is not downloadable', async () => {
    const f = okFetch();
    await expect(downloadSourceTrack(directUrlTrack({ ...input, confirmedDownloadAllowed: false }), { db: makeDb(), fetchImpl: f })).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects HTML pages, HTTP errors and network/CORS failures', async () => {
    const t = directUrlTrack(input);
    await expect(downloadSourceTrack(t, { db: makeDb(), fetchImpl: okFetch('text/html') })).rejects.toThrow(/not point to an audio file/);
    await expect(downloadSourceTrack(t, { db: makeDb(), fetchImpl: vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch })).rejects.toThrow(/404/);
    await expect(downloadSourceTrack(t, { db: makeDb(), fetchImpl: vi.fn(async () => { throw new TypeError('cors'); }) as unknown as typeof fetch })).rejects.toThrow(/CORS/);
  });

  it('deduplicates repeated downloads', async () => {
    const db = makeDb();
    const t = directUrlTrack(input);
    await downloadSourceTrack(t, { db, fetchImpl: okFetch(), parse: fakeParser() });
    const again = await downloadSourceTrack(t, { db, fetchImpl: okFetch(), parse: fakeParser() });
    expect(again.status).toBe('duplicate');
  });
});

describe('catalog source', () => {
  it('treats anything but an explicit allowsDownload:true as not allowed', () => {
    const tracks = parseCatalog({ tracks: [
      { id: '1', title: 'A', artist: 'X', url: 'https://e.org/a.mp3', license: { name: 'CC0', allowsDownload: true } },
      { id: '2', title: 'B', artist: 'X', url: 'https://e.org/b.mp3', license: { name: 'All rights reserved' } },
      { id: '3', title: 'C', artist: 'X', url: 'https://e.org/c.mp3', license: { name: 'x', allowsDownload: 'yes' } },
      { title: 'broken' },
    ] }, 'cat');
    expect(tracks.map((t) => t.license.allowsDownload)).toEqual([true, false, false]);
    expect(tracks[0].license.attribution).toBe('X');
  });

  it('rejects malformed catalogs', () => {
    expect(() => parseCatalog({}, 'x')).toThrow(/tracks/);
  });
});
