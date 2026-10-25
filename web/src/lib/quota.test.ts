import { describe, expect, it, vi } from 'vitest';
import { importFile, importFiles } from './library';
import { StorageQuotaError, isQuotaError } from './errors';
import { classify, formatBytes, formatTime, getStorageStatus, requestPersistence } from './storage';
import { audioFile, fakeParser, makeDb } from '../test/helpers';

const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

describe('storage quota failures', () => {
  it('rolls back completely when the audio write hits the quota', async () => {
    const db = makeDb();
    await importFile(audioFile('ok.mp3', 'OK'), 'ok.mp3', { db, parse: fakeParser() });
    const before = { t: await db.tracks.count(), b: await db.blobs.count(), a: await db.art.count() };

    const spy = vi.spyOn(db.blobs, 'put').mockRejectedValue(quota());
    await expect(importFile(audioFile('big.mp3', 'BIG'), 'big.mp3', { db, parse: fakeParser({ art: new Blob(['a']) }) })).rejects.toBeInstanceOf(StorageQuotaError);
    spy.mockRestore();

    expect({ t: await db.tracks.count(), b: await db.blobs.count(), a: await db.art.count() }).toEqual(before);
  });

  it('rolls back track + audio if the final track-row write fails', async () => {
    const db = makeDb();
    vi.spyOn(db.tracks, 'put').mockRejectedValue(quota());
    await expect(importFile(audioFile('a.mp3', 'A'), 'a.mp3', { db, parse: fakeParser() })).rejects.toBeInstanceOf(StorageQuotaError);
    expect(await db.blobs.count()).toBe(0);
    expect(await db.tracks.count()).toBe(0);
  });

  it('batch import stops cleanly, keeps earlier files, and flags the quota error', async () => {
    const db = makeDb();
    const real = db.blobs.put.bind(db.blobs);
    let n = 0;
    vi.spyOn(db.blobs, 'put').mockImplementation(((...args: Parameters<typeof real>) => (++n === 2 ? Promise.reject(quota()) : real(...args))) as typeof real);
    const s = await importFiles([audioFile('1.mp3', '1'), audioFile('2.mp3', '2'), audioFile('3.mp3', '3')], { db, parse: fakeParser() });
    expect(s.quotaExceeded).toBe(true);
    expect(s.added).toHaveLength(1);
    expect(s.failed).toHaveLength(1);
    expect(await db.tracks.count()).toBe(1);
    expect(await db.blobs.count()).toBe(1);
  });

  it('non-quota errors are not mislabelled', async () => {
    const db = makeDb();
    vi.spyOn(db.blobs, 'put').mockRejectedValue(new Error('disk on fire'));
    await expect(importFile(audioFile('a.mp3', 'A'), 'a.mp3', { db, parse: fakeParser() })).rejects.toThrow('disk on fire');
  });

  it('recognises quota errors in the shapes browsers and Dexie produce', () => {
    expect(isQuotaError(quota())).toBe(true);
    expect(isQuotaError({ name: 'AbortError', inner: quota() })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error('x'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });

  it('library stays usable after a failed import', async () => {
    const db = makeDb();
    const spy = vi.spyOn(db.blobs, 'put').mockRejectedValueOnce(quota());
    await expect(importFile(audioFile('a.mp3', 'A'), 'a.mp3', { db, parse: fakeParser() })).rejects.toBeInstanceOf(StorageQuotaError);
    spy.mockRestore();
    const r = await importFile(audioFile('a.mp3', 'A'), 'a.mp3', { db, parse: fakeParser() });
    expect(r.status).toBe('added');
  });
});

describe('storage indicator', () => {
  const GB = 1024 ** 3, MB = 1024 ** 2;
  it('classifies usage levels', () => {
    expect(classify(1 * GB, 10 * GB)).toBe('ok');
    expect(classify(8.5 * GB, 10 * GB)).toBe('warn');
    expect(classify(9.7 * GB, 10 * GB)).toBe('critical');
    expect(classify(900 * MB, 1000 * MB)).toBe('warn'); // <200MB free
    expect(classify(0, 0)).toBe('ok');
  });

  it('reads navigator.storage', async () => {
    const s = await getStorageStatus({ estimate: async () => ({ usage: 9 * GB, quota: 10 * GB }), persisted: async () => false, persist: async () => true });
    expect(s).toMatchObject({ supported: true, level: 'warn', persisted: false });
    expect(s.free).toBe(1 * GB);
  });

  it('copes with missing or throwing storage APIs', async () => {
    expect((await getStorageStatus(undefined)).supported).toBe(false);
    expect((await getStorageStatus({ estimate: async () => { throw new Error('x'); } } as any)).supported).toBe(false);
    expect(await requestPersistence(undefined)).toBeNull();
    expect(await requestPersistence({ persist: async () => { throw new Error('x'); } } as any)).toBeNull();
  });

  it('requests persistence once and reports the answer', async () => {
    const persist = vi.fn(async () => true);
    expect(await requestPersistence({ persist, persisted: async () => false, estimate: async () => ({}) })).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    persist.mockClear();
    expect(await requestPersistence({ persist, persisted: async () => true, estimate: async () => ({}) })).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('formats sizes and times', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(5 * MB)).toBe('5.0 MB');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('0:00');
  });
});
