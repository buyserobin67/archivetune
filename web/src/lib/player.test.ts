import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importFiles } from './library';
import { Player } from './player';
import { audioFile, FakeAudio, FakeMediaSession, fakeParser, makeDb, tick } from '../test/helpers';

async function setup(count = 3) {
  const db = makeDb();
  const files = Array.from({ length: count }, (_, i) => audioFile(`t${i}.mp3`, `audio-${i}`));
  const { added } = await importFiles(files, { db, parse: fakeParser() });
  const audio = new FakeAudio();
  const ms = new FakeMediaSession();
  const player = new Player({ audio: audio.asAudio(), db, mediaSession: ms, makeMetadata: (i) => i });
  const ids = added.map((t) => t.id);
  return { db, audio, ms, player, ids };
}

describe('offline playback', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    // No network at all: any fetch is a test failure.
    globalThis.fetch = vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('plays an imported track from IndexedDB without touching the network', async () => {
    const { audio, player, ids } = await setup();
    await player.playQueue(ids, 1);
    expect(player.getState().track?.id).toBe(ids[1]);
    expect(audio.src.startsWith('blob:')).toBe(true);
    expect(audio.playCalls).toBe(1);
    expect(player.getState().isPlaying).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('counts a play and updates "recently played"', async () => {
    const { db, player, ids } = await setup();
    await player.playQueue(ids, 0);
    await tick(20);
    const t = (await db.tracks.get(ids[0]))!;
    expect(t.playCount).toBe(1);
    expect(t.lastPlayedAt).toBeGreaterThan(0);
  });

  it('restores the queue and position after a restart, paused', async () => {
    const { db, audio, player, ids } = await setup();
    await player.playQueue(ids, 2);
    audio.currentTime = 42;
    audio.dispatchEvent(new Event('timeupdate'));
    player.pause();
    await tick(20);

    const audio2 = new FakeAudio();
    const p2 = new Player({ audio: audio2.asAudio(), db, mediaSession: null });
    await p2.restore();
    expect(p2.getState().track?.id).toBe(ids[2]);
    expect(p2.getState().isPlaying).toBe(false);
    expect(audio2.playCalls).toBe(0);
    audio2.dispatchEvent(new Event('loadedmetadata'));
    expect(audio2.currentTime).toBe(42);
  });
});

describe('player behaviour', () => {
  it('uses one audio element and advances on ended', async () => {
    const { audio, player, ids } = await setup();
    await player.playQueue(ids, 0);
    const el = player.audio;
    audio.finish();
    await tick(10);
    expect(player.getState().track?.id).toBe(ids[1]);
    expect(player.audio).toBe(el);
    expect(audio.playCalls).toBe(2);
  });

  it('stops at the end of the queue; repeat-all wraps; repeat-one replays', async () => {
    const { audio, player, ids } = await setup(2);
    await player.playQueue(ids, 1);
    audio.finish(); await tick(10);
    expect(player.getState().isPlaying).toBe(false);
    expect(player.getState().track?.id).toBe(ids[1]);

    player.setRepeat('all');
    await player.playQueue(ids, 1);
    audio.finish(); await tick(10);
    expect(player.getState().track?.id).toBe(ids[0]);

    player.setRepeat('one');
    const calls = audio.playCalls;
    audio.finish(); await tick(10);
    expect(player.getState().track?.id).toBe(ids[0]);
    expect(audio.playCalls).toBe(calls + 1);
  });

  it('previous restarts the track after 3 seconds, otherwise goes back', async () => {
    const { audio, player, ids } = await setup();
    await player.playQueue(ids, 1);
    audio.currentTime = 10;
    await player.previous();
    expect(audio.currentTime).toBe(0);
    expect(player.getState().track?.id).toBe(ids[1]);
    await player.previous();
    expect(player.getState().track?.id).toBe(ids[0]);
  });

  it('treats a pause it did not ask for as an interruption, and clears it on play', async () => {
    const { audio, player, ids } = await setup();
    await player.playQueue(ids, 0);
    audio.pause(); // e.g. phone call: the browser pauses, we did not
    expect(player.getState()).toMatchObject({ isPlaying: false, interrupted: true });
    await player.play();
    expect(player.getState()).toMatchObject({ isPlaying: true, interrupted: false });
    player.pause(); // user pause is not an interruption
    expect(player.getState()).toMatchObject({ isPlaying: false, interrupted: false });
  });

  it('reports a blocked play() instead of throwing', async () => {
    const { audio, player, ids } = await setup();
    audio.failPlayWith = 'NotAllowedError';
    await player.playQueue(ids, 0);
    expect(player.getState().isPlaying).toBe(false);
    expect(player.getState().error).toMatch(/tap play/i);
  });

  it('skips tracks whose audio is missing', async () => {
    const { db, audio, player, ids } = await setup(3);
    await db.blobs.delete(ids[1]);
    await player.playQueue(ids, 0);
    audio.finish(); await tick(20);
    expect(player.getState().track?.id).toBe(ids[2]);
    expect(player.getState().isPlaying).toBe(true);
  });

  it('serves queue operations through the player', async () => {
    const { player, ids } = await setup(3);
    await player.playQueue([ids[0]], 0);
    player.enqueue([ids[1]]);
    player.enqueueNext([ids[2]]);
    expect(player.getState().queue.items).toEqual([ids[0], ids[2], ids[1]]);
    player.moveInQueue(2, 1);
    expect(player.getState().queue.items).toEqual([ids[0], ids[1], ids[2]]);
    await player.removeFromQueue(1);
    expect(player.getState().queue.items).toEqual([ids[0], ids[2]]);
    player.toggleShuffle();
    expect(player.getState().queue.shuffle).toBe(true);
    player.cycleRepeat();
    expect(player.getState().queue.repeat).toBe('all');
  });
});

describe('Media Session', () => {
  it('publishes metadata, playback state and handlers', async () => {
    const { ms, player, ids } = await setup();
    for (const a of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward']) expect(ms.handlers.has(a)).toBe(true);
    await player.playQueue(ids, 0);
    await tick(10);
    expect(ms.metadata).toMatchObject({ title: 't0', artist: 'Test Artist', album: 'Test Album' });
    expect(ms.playbackState).toBe('playing');
    ms.handlers.get('pause')!();
    expect(ms.playbackState).toBe('paused');
  });

  it('lock-screen next / seekto drive the player', async () => {
    const { audio, ms, player, ids } = await setup();
    await player.playQueue(ids, 0);
    ms.handlers.get('nexttrack')!();
    await tick(10);
    expect(player.getState().track?.id).toBe(ids[1]);
    ms.handlers.get('seekto')!({ seekTime: 30 });
    expect(audio.currentTime).toBe(30);
    ms.handlers.get('seekforward')!({ seekOffset: 5 });
    expect(audio.currentTime).toBe(35);
  });

  it('survives browsers that reject unsupported actions', () => {
    const ms = new FakeMediaSession();
    ms.setActionHandler = () => { throw new TypeError('unsupported'); };
    expect(() => new Player({ audio: new FakeAudio().asAudio(), db: makeDb(), mediaSession: ms })).not.toThrow();
  });
});

describe('sleep timer', () => {
  afterEach(() => vi.useRealTimers());

  it('pauses after the chosen minutes and clears itself', async () => {
    const { player, ids } = await setup();
    await player.playQueue(ids, 0);
    vi.useFakeTimers();
    player.setSleep(10);
    expect(player.getState().sleepEndsAt).toBeGreaterThan(Date.now());
    vi.advanceTimersByTime(9 * 60_000);
    expect(player.getState().isPlaying).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(player.getState()).toMatchObject({ isPlaying: false, sleepEndsAt: null });
  });

  it('can be cancelled', async () => {
    const { player, ids } = await setup();
    await player.playQueue(ids, 0);
    vi.useFakeTimers();
    player.setSleep(5);
    player.setSleep(null);
    vi.advanceTimersByTime(10 * 60_000);
    expect(player.getState().isPlaying).toBe(true);
    expect(player.getState().sleepEndsAt).toBeNull();
  });

  it('"end of track" stops instead of advancing', async () => {
    const { audio, player, ids } = await setup();
    await player.playQueue(ids, 0);
    player.setSleep('track');
    expect(player.getState().sleepEndOfTrack).toBe(true);
    audio.finish();
    await tick(10);
    expect(player.getState()).toMatchObject({ isPlaying: false, sleepEndOfTrack: false });
    expect(player.getState().track?.id).toBe(ids[0]);
  });
});

describe('polish: prefetch, levelling, stale resume', () => {
  it('reads the next song shortly before the end and plays it without another database read', async () => {
    const { db, audio, player, ids } = await setup(2);
    await player.playQueue(ids, 0);
    audio.currentTime = audio.duration - 5;
    audio.dispatchEvent(new Event('timeupdate'));
    await tick(20);
    const get = vi.spyOn(db.blobs, 'get');
    audio.finish();
    await tick(20);
    expect(player.getState().track?.id).toBe(ids[1]);
    expect(get).not.toHaveBeenCalled();
    expect(audio.playCalls).toBe(2);
  });

  it('turns loud tagged tracks down and leaves untagged ones alone', async () => {
    const db = makeDb();
    const { added } = await importFiles([audioFile('a.mp3', 'A'), audioFile('b.mp3', 'B')], { db, parse: async (_f, n) => (n === 'a.mp3' ? { gain: { track: -6, album: -9 } } : {}) });
    const audio = new FakeAudio();
    const player = new Player({ audio: audio.asAudio(), db, levelling: 'track' });
    await player.playQueue(added.map((t) => t.id), 0);
    expect(audio.volume).toBeCloseTo(10 ** (-6 / 20));
    player.setLevelling('album');
    expect(audio.volume).toBeCloseTo(10 ** (-9 / 20));
    player.setLevelling('off');
    expect(audio.volume).toBe(1);
    player.setLevelling('track');
    await player.next();
    expect(audio.volume).toBe(1);
  });

  it('reloads the song at the same spot after a long pause in the background', async () => {
    const db = makeDb();
    const { added } = await importFiles([audioFile('a.mp3', 'A')], { db, parse: fakeParser() });
    const audio = new FakeAudio();
    let hidden = false, now = 1_000_000;
    const fns: (() => void)[] = [];
    const player = new Player({ audio: audio.asAudio(), db, now: () => now, visibility: { hidden: () => hidden, onChange: (fn) => fns.push(fn) } });
    await player.playQueue([added[0].id], 0);
    audio.currentTime = 42;
    player.pause();
    const src = audio.src;
    hidden = true; fns.forEach((f) => f());
    now += 60_000;
    hidden = false; fns.forEach((f) => f());
    await player.play();
    expect(audio.src).not.toBe(src);
    expect(player.getState().isPlaying).toBe(true);
    // a short pause plays straight on
    player.pause();
    const src2 = audio.src;
    now += 5_000;
    await player.play();
    expect(audio.src).toBe(src2);
  });

  it('undoes a queue removal', async () => {
    const { player, ids } = await setup(3);
    await player.playQueue(ids, 0);
    const before = player.getState().queue;
    await player.removeFromQueue(2);
    player.insertInQueue(2, ids[2], before.original.indexOf(ids[2]));
    expect(player.getState().queue.items).toEqual(before.items);
  });
});
