import { describe, expect, it } from 'vitest';
import { CadenceDB } from './db';
import { autoTrimAll, autoTrimNew, analyzeTrack, trimTrack, undoAll, useOriginal, type ArtProcessor, AUTO_TRIM_KEY } from './artEdits';
import { getArtBlob, getOriginalArtBlob } from './artSource';
import { deleteTrack, importFile } from './library';
import { audioFile, fakeParser, makeDb } from '../test/helpers';

/** A fake image: the blob text is JSON {w,h,top,bottom,left,right,alpha}; pixels are generated from it. */
const spec = (o: { w: number; h: number; top?: number; bottom?: number; left?: number; right?: number; type?: string }) => new Blob([JSON.stringify(o)], { type: o.type ?? 'image/png' });
const read = async (b: Blob) => JSON.parse(await b.text()) as { w: number; h: number; top?: number; bottom?: number; left?: number; right?: number; cropped?: unknown };
const fake: ArtProcessor = {
  async decode(blob, maxSide) {
    const s = await read(blob);
    const k = Math.min(1, maxSide / Math.max(s.w, s.h)), w = Math.round(s.w * k), h = Math.round(s.h * k);
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const border = y < (s.top ?? 0) * k || y >= h - (s.bottom ?? 0) * k || x < (s.left ?? 0) * k || x >= w - (s.right ?? 0) * k;
      d.set(border ? [0, 0, 0, 0] : [(x * 37 + y * 11) % 200 + 20, (x * 13 + y * 29) % 200 + 20, (x * 7 + y * 53) % 200 + 20, 255], (y * w + x) * 4);
    }
    return { data: d, width: w, height: h, srcWidth: s.w, srcHeight: s.h };
  },
  async crop(blob, r) { return new Blob([JSON.stringify({ w: r.w, h: r.h, cropped: r })], { type: blob.type }); },
};

async function withCover(db: CadenceDB, name: string, art: Blob, proc: ArtProcessor | null = null) {
  const r = await importFile(audioFile(name, name), name, { db, parse: fakeParser({ art }), artProcessor: proc });
  if (r.status !== 'added') throw new Error('not added');
  return r.track.id;
}

describe('non-destructive artwork trimming', () => {
  it('reports the real size and the transparent bands without changing anything', async () => {
    const db = makeDb();
    const id = await withCover(db, 'a.mp3', spec({ w: 1280, h: 1280, top: 280, bottom: 280 }));
    const a = (await analyzeTrack(id, fake, { db }))!;
    expect(a.report).toMatchObject({ width: 1280, height: 1280, kind: 'transparent', hasAlpha: true });
    expect(a.report.borders.top).toBeGreaterThan(270);
    expect(a.rect.w).toBe(1280);
    expect(a.rect.h).toBeGreaterThan(710);
    expect(a.rect.h).toBeLessThan(730);
    expect(a.verdict).toMatch(/Transparent border/);
    expect(await db.artEdits.count()).toBe(0);
  });

  it('trims into a separate copy, keeps the original bytes, and undo restores them exactly', async () => {
    const db = makeDb();
    const orig = spec({ w: 800, h: 800, top: 150, bottom: 150 });
    const id = await withCover(db, 'a.mp3', orig);
    const before = await (await getOriginalArtBlob(id, db))!.text();
    expect(await trimTrack(id, fake, { db })).toBe('trimmed');
    const shown = await read((await getArtBlob(id, db))!);
    expect(shown.cropped).toBeDefined();
    expect(shown.h).toBeLessThan(800);
    expect(await (await getOriginalArtBlob(id, db))!.text()).toBe(before); // untouched
    await useOriginal(id, db);
    expect(await (await getArtBlob(id, db))!.text()).toBe(before);
    expect((await db.artEdits.get(id))!.disabled).toBe(true);
  });

  it('marks clean covers so they are not rescanned, and leaves them unchanged', async () => {
    const db = makeDb();
    const id = await withCover(db, 'a.mp3', spec({ w: 500, h: 500 }));
    expect(await trimTrack(id, fake, { db })).toBe('clean');
    expect((await db.artEdits.get(id))!.blob).toBeUndefined();
    expect(await (await getArtBlob(id, db))!.text()).toBe(await (await getOriginalArtBlob(id, db))!.text());
  });

  it('automatic mode only trims transparent borders; flat colour needs the manual option', async () => {
    const db = makeDb();
    const proc: ArtProcessor = { ...fake, decode: async (b, m) => {
      const r = await fake.decode(b, m);
      if (!r) return r;
      for (let i = 0; i < r.data.length; i += 4) if (r.data[i + 3] === 0) (r.data as Uint8ClampedArray).set([36, 38, 41, 255], i); // opaque flat bars instead of alpha
      return r;
    } };
    const id = await withCover(db, 'a.mp3', spec({ w: 600, h: 600, top: 100, bottom: 100 }));
    expect(await trimTrack(id, proc, { db })).toBe('clean'); // automatic: leaves flat bars alone
    expect(await trimTrack(id, proc, { db, flat: true })).toBe('trimmed'); // manual
    expect((await db.artEdits.get(id))!.kind).toBe('flat');
  });

  it('auto-trims on import when enabled, respects the setting and does nothing without a browser backend', async () => {
    const db = makeDb();
    const id = await withCover(db, 'a.mp3', spec({ w: 400, h: 400, top: 80, bottom: 80 }), fake);
    expect((await db.artEdits.get(id))!.kind).toBe('transparent');
    await db.settings.put({ key: AUTO_TRIM_KEY, value: false });
    const off = await withCover(db, 'b.mp3', spec({ w: 400, h: 400, top: 80, bottom: 80 }), fake);
    expect(await db.artEdits.get(off)).toBeUndefined();
    await db.settings.put({ key: AUTO_TRIM_KEY, value: true });
    const none = await withCover(db, 'c.mp3', spec({ w: 400, h: 400, top: 80, bottom: 80 }), null);
    expect(await db.artEdits.get(none)).toBeUndefined();
    expect(await autoTrimNew(none, null, db)).toBe('off');
  });

  it('background pass trims existing tracks once, skips ones the user reverted, and is idempotent', async () => {
    const db = makeDb();
    const a = await withCover(db, 'a.mp3', spec({ w: 400, h: 400, top: 80, bottom: 80 }));
    const b = await withCover(db, 'b.mp3', spec({ w: 400, h: 400, top: 80, bottom: 80 }));
    const c = await withCover(db, 'c.mp3', spec({ w: 400, h: 400 }));
    await useOriginal(b, db);
    expect(await autoTrimAll(fake, { db })).toBe(1);
    expect((await db.artEdits.get(a))!.blob).toBeDefined();
    expect((await db.artEdits.get(b))!.blob).toBeUndefined();
    expect((await db.artEdits.get(c))!.kind).toBe('clean');
    expect(await autoTrimAll(fake, { db })).toBe(0);
  });

  it('undo all removes every trim, turns automatic trimming off, and keeps originals', async () => {
    const db = makeDb();
    const a = await withCover(db, 'a.mp3', spec({ w: 400, h: 400, top: 80, bottom: 80 }));
    await trimTrack(a, fake, { db });
    expect(await undoAll(db)).toBe(1);
    expect(await db.artEdits.count()).toBe(0);
    expect((await db.settings.get(AUTO_TRIM_KEY))!.value).toBe(false);
    expect((await read((await getArtBlob(a, db))!)).h).toBe(400);
  });

  it('deleting a track removes its trimmed copy', async () => {
    const db = makeDb();
    const a = await withCover(db, 'a.mp3', spec({ w: 400, h: 400, top: 80, bottom: 80 }));
    await trimTrack(a, fake, { db });
    await deleteTrack(a, db);
    expect(await db.artEdits.count()).toBe(0);
  });

  it('a failing image backend never breaks the library', async () => {
    const db = makeDb();
    const id = await withCover(db, 'a.mp3', spec({ w: 400, h: 400, top: 80, bottom: 80 }));
    const bad: ArtProcessor = { decode: async () => { throw new Error('boom'); }, crop: async () => { throw new Error('boom'); } };
    expect(await trimTrack(id, bad, { db })).toBe('failed');
    expect(await db.tracks.count()).toBe(1);
  });

  it('upgrading a v2 database keeps every row and adds the artwork-edit table', async () => {
    const name = `up3-${Math.random()}`;
    const { default: Dexie } = await import('dexie');
    const v2 = new Dexie(name);
    v2.version(1).stores({ tracks: 'id, &hash, title, artist, album, favorite, addedAt, lastPlayedAt', blobs: 'trackId', art: 'trackId', playlists: 'id, name, updatedAt', settings: 'key' });
    v2.version(2).stores({ lyrics: 'trackId' });
    await v2.table('tracks').put({ id: 'old', hash: 'h', title: 'Old', artist: 'A', album: 'B', duration: 1, mime: 'audio/mpeg', size: 1, fileName: 'o.mp3', hasArt: true, favorite: 0, addedAt: 1, lastPlayedAt: 0, playCount: 0 });
    await v2.table('art').put({ trackId: 'old', blob: new Blob(['img']) });
    await v2.table('lyrics').put({ trackId: 'old', kind: 'plain', text: 'x', source: 'manual' });
    v2.close();
    const v3 = new CadenceDB(name);
    expect((await v3.tracks.get('old'))!.title).toBe('Old');
    expect(await (await v3.art.get('old'))!.blob.text()).toBe('img');
    expect(await v3.lyrics.count()).toBe(1);
    expect(await v3.artEdits.count()).toBe(0);
  });
});
