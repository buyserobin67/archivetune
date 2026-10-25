import { useSyncExternalStore } from 'react';
import { getArtUrl } from './art';
import { db as defaultDb, getSetting, setSetting, type CadenceDB } from './db';
import { markPlayed } from './library';
import { gainToVolume, readLevelling, type Levelling } from './levelling';
import { dbListenWriters, ListenTracker } from './stats';
import * as Q from './queue';
import type { RepeatMode, Track } from './types';

export interface PlayerState {
  track: Track | null;
  isPlaying: boolean;
  loading: boolean;
  /** Paused by the system (call, Siri, another app) rather than by the user. */
  interrupted: boolean;
  error: string | null;
  queue: Q.QueueState;
  /** Epoch ms when the sleep timer fires, or null. */
  sleepEndsAt: number | null;
  /** Stop when the current track finishes. */
  sleepEndOfTrack: boolean;
}

export interface TimeState { currentTime: number; duration: number }

/** The slice of HTMLAudioElement the player uses. Lets tests inject a fake. */
export type AudioLike = Pick<
  HTMLAudioElement,
  'src' | 'currentTime' | 'duration' | 'paused' | 'play' | 'pause' | 'load' | 'addEventListener' | 'removeAttribute'
> & { preload: string; volume: number };

/** Whether the page is in the background. Injected in tests. */
export interface VisibilityLike { hidden(): boolean; onChange(fn: () => void): void }

interface MediaSessionLike {
  metadata: unknown;
  playbackState: 'none' | 'paused' | 'playing';
  setActionHandler(action: string, handler: ((d: any) => void) | null): void;
  setPositionState?(s?: { duration: number; playbackRate: number; position: number }): void;
}

export interface PlayerDeps {
  audio: AudioLike;
  db?: CadenceDB;
  mediaSession?: MediaSessionLike | null;
  makeMetadata?: (init: { title: string; artist: string; album: string; artwork: { src: string; sizes: string; type?: string }[] }) => unknown;
  fallbackArt?: string;
  visibility?: VisibilityLike | null;
  levelling?: Levelling;
  now?: () => number;
}

const RESTART_THRESHOLD = 3;
/** Seconds before the end at which the next song's row and audio are read from the database. */
export const PREFETCH_LEAD = 10;
/**
 * iOS can drop a home-screen app's audio session while it sits paused in the background. After a pause this long that
 * spanned a trip to the background, the first play reloads the song at the same position instead of trusting the old one.
 */
export const STALE_PAUSE_MS = 30_000;

export class Player {
  readonly audio: AudioLike;
  private db: CadenceDB;
  private ms: MediaSessionLike | null;
  private makeMetadata: NonNullable<PlayerDeps['makeMetadata']>;
  private fallbackArt: string;

  private state: PlayerState = { track: null, isPlaying: false, loading: false, interrupted: false, error: null, queue: Q.emptyQueue(), sleepEndsAt: null, sleepEndOfTrack: false };
  private time: TimeState = { currentTime: 0, duration: 0 };
  private listeners = new Set<() => void>();
  private timeListeners = new Set<() => void>();

  private objectUrl: string | null = null;
  private loadToken = 0;
  private userPaused = true;
  private pendingSeek = 0;
  private countedPlay = false;
  private consecutiveFailures = 0;
  private tracker: ListenTracker;
  private lastPosSave = 0;
  private lastPosState = 0;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private prepared: { id: string; track: Track; blob: Blob } | null = null;
  private preparing: string | null = null;
  private levelling: Levelling;
  private visibility: VisibilityLike | null;
  private now: () => number;
  private pausedAt = 0;
  private backgroundedWhilePaused = false;

  constructor(deps: PlayerDeps) {
    this.audio = deps.audio;
    this.db = deps.db ?? defaultDb;
    this.ms = deps.mediaSession ?? null;
    this.makeMetadata = deps.makeMetadata ?? ((i) => (typeof MediaMetadata !== 'undefined' ? new MediaMetadata(i) : i));
    this.fallbackArt = deps.fallbackArt ?? '';
    this.levelling = deps.levelling ?? 'off';
    this.visibility = deps.visibility ?? null;
    this.now = deps.now ?? Date.now;
    this.visibility?.onChange(() => { if (this.visibility!.hidden() && this.pausedAt) this.backgroundedWhilePaused = true; });
    this.audio.preload = 'auto';
    const w = dbListenWriters(this.db);
    this.tracker = new ListenTracker(w.write, w.update);
    this.bindAudio();
    this.bindMediaSession();
  }

  // ---- external store ----
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  subscribeTime = (fn: () => void) => { this.timeListeners.add(fn); return () => this.timeListeners.delete(fn); };
  getState = () => this.state;
  getTime = () => this.time;

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  private setTime(t: Partial<TimeState>) {
    const nt = { ...this.time, ...t };
    if (nt.currentTime === this.time.currentTime && nt.duration === this.time.duration) return;
    this.time = nt;
    this.timeListeners.forEach((l) => l());
  }

  // ---- audio events ----
  private bindAudio() {
    const a = this.audio;
    a.addEventListener('play', () => {
      this.pausedAt = 0;
      this.backgroundedWhilePaused = false;
      this.set({ isPlaying: true, interrupted: false, error: null });
      this.syncSession();
    });
    a.addEventListener('playing', () => {
      this.consecutiveFailures = 0;
      this.set({ loading: false, isPlaying: true });
      if (!this.countedPlay && this.state.track) {
        this.countedPlay = true;
        void markPlayed(this.state.track.id, this.db).catch(() => {});
      }
      this.syncSession();
    });
    a.addEventListener('pause', () => {
      if ((a as HTMLAudioElement).ended) return; // handled by 'ended'
      // A pause we did not ask for (phone call, Siri, another app grabbing audio) is an interruption.
      void this.tracker.flush();
      const interrupted = !this.userPaused && this.state.track !== null && this.loadToken > 0 && !this.state.loading;
      this.pausedAt = this.now();
      this.backgroundedWhilePaused = !!this.visibility?.hidden();
      this.set({ isPlaying: false, interrupted });
      this.syncSession();
      void this.savePosition(true);
    });
    a.addEventListener('waiting', () => this.set({ loading: true }));
    a.addEventListener('canplay', () => this.set({ loading: false }));
    a.addEventListener('loadedmetadata', () => {
      if (this.pendingSeek > 0 && Number.isFinite(a.duration)) {
        try { a.currentTime = Math.min(this.pendingSeek, a.duration); } catch { /* ignore */ }
      }
      this.pendingSeek = 0;
      this.setTime({ duration: Number.isFinite(a.duration) ? a.duration : 0, currentTime: a.currentTime });
      this.updatePositionState(true);
    });
    a.addEventListener('durationchange', () => this.setTime({ duration: Number.isFinite(a.duration) ? a.duration : 0 }));
    a.addEventListener('timeupdate', () => {
      this.tracker.tick(a.currentTime, !a.paused);
      this.setTime({ currentTime: a.currentTime });
      this.updatePositionState(false);
      void this.savePosition(false);
      if (Number.isFinite(a.duration) && a.duration - a.currentTime < PREFETCH_LEAD) void this.prepareNext();
    });
    a.addEventListener('ended', () => void this.onEnded());
    a.addEventListener('error', () => void this.onError());
  }

  private async onEnded() {
    void this.tracker.flush();
    if (this.state.sleepEndOfTrack) {
      this.clearSleep();
      this.userPaused = true;
      this.set({ isPlaying: false });
      this.audio.currentTime = 0;
      this.setTime({ currentTime: 0 });
      this.syncSession();
      return;
    }
    const { state, ended } = Q.next(this.state.queue, true);
    if (state.repeat === 'one' && !ended) {
      this.restartTracker();
      this.audio.currentTime = 0;
      await this.safePlay();
      return;
    }
    if (ended) {
      this.userPaused = true;
      this.set({ isPlaying: false });
      this.audio.currentTime = 0;
      this.setTime({ currentTime: 0 });
      this.syncSession();
      return;
    }
    this.set({ queue: state });
    await this.loadCurrent(true);
  }

  private async onError() {
    if (!this.state.track) return;
    this.consecutiveFailures++;
    this.set({ loading: false, isPlaying: false, error: `Can't play "${this.state.track.title}".` });
    // Move on so one bad file doesn't stall the whole queue, but never loop forever.
    if (!this.userPaused && this.consecutiveFailures < Math.max(this.state.queue.items.length, 1)) await this.skipForward();
  }

  // ---- loading ----
  private async loadCurrent(autoplay: boolean, resumeAt = 0): Promise<void> {
    const token = ++this.loadToken;
    const id = Q.currentId(this.state.queue);
    if (!id) return this.unload();
    this.set({ loading: true, error: null, interrupted: false });
    this.pausedAt = 0;
    const ready = this.prepared?.id === id ? this.prepared : null;
    this.prepared = null;
    this.preparing = null;
    // A prefetched next song skips the database read, which is most of the gap between songs on a phone.
    const [track, blobRow] = ready ? [ready.track, { trackId: id, blob: ready.blob }] : await Promise.all([this.db.tracks.get(id), this.db.blobs.get(id)]);
    if (token !== this.loadToken) return; // superseded by a newer request
    if (!track) {
      this.set({ queue: Q.removeAt(this.state.queue, this.state.queue.index), loading: false });
      return this.loadCurrent(autoplay);
    }
    if (!blobRow) {
      this.set({ track, loading: false, isPlaying: false, error: `"${track.title}" has no audio on this device. Re-import the file from Files.` });
      this.pendingSeek = 0;
      if (autoplay) {
        this.consecutiveFailures++;
        if (this.consecutiveFailures < Math.max(this.state.queue.items.length, 1)) await this.skipForward();
      }
      return;
    }
    const prev = this.objectUrl;
    this.objectUrl = URL.createObjectURL(blobRow.blob);
    this.countedPlay = false;
    this.pendingSeek = resumeAt;
    this.audio.src = this.objectUrl; // same element every time: iOS keeps the audio session alive across tracks
    this.applyVolume(track);
    if (prev) URL.revokeObjectURL(prev);
    this.set({ track });
    this.tracker.start({ id: track.id, title: track.title, artist: track.artist, album: track.album, duration: track.duration }, resumeAt);
    this.setTime({ currentTime: 0, duration: track.duration });
    void this.updateMetadata(track);
    this.persistQueue();
    if (autoplay) {
      this.userPaused = false;
      await this.safePlay();
    } else {
      this.userPaused = true;
      this.set({ loading: false, isPlaying: false });
    }
  }

  /** Reads the song that will play next into memory shortly before this one ends. */
  private async prepareNext() {
    const after = Q.afterCurrent(this.state.queue);
    const id = after.kind === 'next' || (after.kind === 'wrap' && !after.same) ? after.id : null;
    if (!id || this.preparing === id || this.prepared?.id === id) return;
    this.preparing = id;
    try {
      const [track, row] = await Promise.all([this.db.tracks.get(id), this.db.blobs.get(id)]);
      if (this.preparing !== id || !track || !row) return;
      this.prepared = { id, track, blob: row.blob };
    } catch { /* the normal load path will report it */ }
  }

  private applyVolume(track: Track) {
    try { this.audio.volume = gainToVolume(track.gain, this.levelling); } catch { /* read-only on iOS */ }
  }

  setLevelling(mode: Levelling) {
    this.levelling = mode;
    if (this.state.track) this.applyVolume(this.state.track);
  }

  private restartTracker() {
    const t = this.state.track;
    this.tracker.start(t ? { id: t.id, title: t.title, artist: t.artist, album: t.album, duration: t.duration } : null, 0);
  }

  private unload() {
    this.tracker.start(null);
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
    this.set({ track: null, isPlaying: false, loading: false });
    this.setTime({ currentTime: 0, duration: 0 });
    if (this.ms) this.ms.metadata = null;
  }

  private async safePlay() {
    try {
      await this.audio.play();
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === 'AbortError') return; // a newer load interrupted this play(); not an error
      this.userPaused = true;
      this.set({
        isPlaying: false,
        loading: false,
        error: name === 'NotAllowedError' ? 'Tap play to start. iOS needs a tap before it will play audio.' : 'Playback failed. Try again.',
      });
    }
  }

  // ---- public controls ----
  async playQueue(ids: string[], startIndex = 0) {
    this.set({ queue: Q.setQueue(this.state.queue, ids, startIndex) });
    await this.loadCurrent(true);
  }

  async playIndex(index: number) {
    this.set({ queue: Q.jumpTo(this.state.queue, index) });
    await this.loadCurrent(true);
  }

  async play() {
    if (!this.state.track) {
      if (this.state.queue.index >= 0) await this.loadCurrent(true);
      return;
    }
    if (this.pausedAt && this.backgroundedWhilePaused && this.now() - this.pausedAt > STALE_PAUSE_MS && !this.visibility?.hidden()) {
      await this.loadCurrent(true, this.audio.currentTime);
      return;
    }
    this.userPaused = false;
    await this.safePlay();
  }

  pause() {
    this.userPaused = true;
    this.audio.pause();
  }

  toggle() { return this.state.isPlaying ? this.pause() : this.play(); }

  async next() { await this.skipForward(); }

  private async skipForward() {
    const { state, ended } = Q.next(this.state.queue, false);
    if (ended) {
      this.userPaused = true;
      this.audio.pause();
      this.set({ isPlaying: false });
      return;
    }
    this.set({ queue: state });
    await this.loadCurrent(true);
  }

  async previous() {
    if (this.audio.currentTime > RESTART_THRESHOLD) { this.seek(0); return; }
    const q = Q.previous(this.state.queue);
    if (q.index === this.state.queue.index) { this.seek(0); return; }
    this.set({ queue: q });
    await this.loadCurrent(!this.userPaused || this.state.isPlaying);
  }

  seek(t: number) {
    const dur = Number.isFinite(this.audio.duration) ? this.audio.duration : this.time.duration;
    const clamped = Math.max(0, dur ? Math.min(t, dur) : t);
    try { this.audio.currentTime = clamped; } catch { /* metadata not ready yet */ }
    this.setTime({ currentTime: clamped });
    this.updatePositionState(true);
  }

  seekBy(delta: number) { this.seek(this.audio.currentTime + delta); }

  setShuffle(on: boolean) {
    this.set({ queue: Q.setShuffle(this.state.queue, on) });
    this.persistQueue();
  }
  toggleShuffle() { this.setShuffle(!this.state.queue.shuffle); }
  setRepeat(m: RepeatMode) { this.set({ queue: { ...this.state.queue, repeat: m } }); this.persistQueue(); }
  cycleRepeat() { this.setRepeat(Q.nextRepeat(this.state.queue.repeat)); }

  enqueue(ids: string[]) {
    const wasEmpty = this.state.queue.index < 0;
    this.set({ queue: Q.addToEnd(this.state.queue, ids) });
    this.persistQueue();
    if (wasEmpty) void this.loadCurrent(false);
  }
  enqueueNext(ids: string[]) {
    const wasEmpty = this.state.queue.index < 0;
    this.set({ queue: Q.playNext(this.state.queue, ids) });
    this.persistQueue();
    if (wasEmpty) void this.loadCurrent(false);
  }
  async removeFromQueue(index: number) {
    const wasCurrent = index === this.state.queue.index;
    this.set({ queue: Q.removeAt(this.state.queue, index) });
    this.persistQueue();
    if (wasCurrent) await this.loadCurrent(this.state.isPlaying);
  }
  /** Undo for removeFromQueue on an entry that was not playing. */
  insertInQueue(index: number, id: string, originalAt?: number) {
    this.set({ queue: Q.insertAt(this.state.queue, index, id, originalAt) });
    this.persistQueue();
  }
  moveInQueue(from: number, to: number) { this.set({ queue: Q.move(this.state.queue, from, to) }); this.persistQueue(); }
  clearUpcoming() { this.set({ queue: Q.clearUpcoming(this.state.queue) }); this.persistQueue(); }

  /** Call after tracks are deleted so the queue never points at missing audio. */
  async onLibraryChanged() {
    const ids = new Set((await this.db.tracks.toCollection().primaryKeys()) as string[]);
    const cur = Q.currentId(this.state.queue);
    this.prepared = null;
    this.preparing = null;
    this.set({ queue: Q.prune(this.state.queue, (id) => ids.has(id)) });
    if (cur && !ids.has(cur)) await this.loadCurrent(false);
    this.persistQueue();
  }

  // ---- sleep timer ----
  /** minutes: stop after that long. 'track': stop when the current track ends. null: cancel. */
  setSleep(when: number | 'track' | null) {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    if (when === null) return this.set({ sleepEndsAt: null, sleepEndOfTrack: false });
    if (when === 'track') return this.set({ sleepEndsAt: null, sleepEndOfTrack: true });
    const ms = Math.max(1, when) * 60_000;
    this.sleepTimer = setTimeout(() => { this.clearSleep(); this.pause(); }, ms);
    this.set({ sleepEndsAt: Date.now() + ms, sleepEndOfTrack: false });
  }

  private clearSleep() {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    this.set({ sleepEndsAt: null, sleepEndOfTrack: false });
  }

  // ---- persistence ----
  private persistQueue() {
    void setSetting('queue', this.state.queue, this.db).catch(() => {});
  }
  private async savePosition(force: boolean) {
    const now = Date.now();
    if (!force && now - this.lastPosSave < 5000) return;
    this.lastPosSave = now;
    try { await setSetting('position', this.audio.currentTime, this.db); } catch { /* quota: position is non-critical */ }
  }

  /** Restores the last queue and position, paused (iOS will not autoplay without a tap). */
  async restore() {
    const q = await getSetting<Q.QueueState | null>('queue', null, this.db);
    if (!q || !q.items?.length) return;
    const ids = new Set((await this.db.tracks.toCollection().primaryKeys()) as string[]);
    const pos = await getSetting<number>('position', 0, this.db);
    this.set({ queue: Q.prune(q, (id) => ids.has(id)) });
    await this.loadCurrent(false, pos);
  }

  // ---- Media Session ----
  private async updateMetadata(track: Track) {
    if (!this.ms) return;
    const art = track.hasArt ? await getArtUrl(track.id, this.db) : null;
    if (Q.currentId(this.state.queue) !== track.id) return;
    const src = art ?? this.fallbackArt;
    this.ms.metadata = this.makeMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: src ? [{ src, sizes: '512x512' }] : [],
    });
    this.syncSession();
  }

  private syncSession() {
    if (!this.ms) return;
    this.ms.playbackState = !this.state.track ? 'none' : this.state.isPlaying ? 'playing' : 'paused';
  }

  private updatePositionState(force: boolean) {
    const now = Date.now();
    if (!force && now - this.lastPosState < 1000) return;
    this.lastPosState = now;
    const d = this.audio.duration;
    if (!this.ms?.setPositionState || !Number.isFinite(d) || d <= 0) return;
    try {
      this.ms.setPositionState({ duration: d, playbackRate: 1, position: Math.min(this.audio.currentTime, d) });
    } catch { /* invalid state during track changes */ }
  }

  private bindMediaSession() {
    const ms = this.ms;
    if (!ms) return;
    const set = (action: string, fn: (d: any) => void) => { try { ms.setActionHandler(action, fn); } catch { /* unsupported on this browser */ } };
    set('play', () => void this.play());
    set('pause', () => this.pause());
    set('stop', () => { this.pause(); this.seek(0); });
    set('previoustrack', () => void this.previous());
    set('nexttrack', () => void this.next());
    set('seekto', (d) => { if (typeof d?.seekTime === 'number') this.seek(d.seekTime); });
    set('seekbackward', (d) => this.seekBy(-(d?.seekOffset ?? 10)));
    set('seekforward', (d) => this.seekBy(d?.seekOffset ?? 10));
  }
}

// ---- singleton + hooks ----
let instance: Player | null = null;

/** One Player, one HTMLAudioElement, for the lifetime of the page. Never created inside a component. */
export function getPlayer(): Player {
  if (!instance) {
    const audio = new Audio();
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    const base = import.meta.env.BASE_URL;
    instance = new Player({
      audio,
      mediaSession: 'mediaSession' in navigator ? (navigator.mediaSession as unknown as MediaSessionLike) : null,
      fallbackArt: new URL(`${base}icons/icon-512.png`, location.href).href,
      levelling: readLevelling(),
      visibility: { hidden: () => document.visibilityState === 'hidden', onChange: (fn) => document.addEventListener('visibilitychange', fn) },
    });
  }
  return instance;
}

export function usePlayer(): PlayerState {
  const p = getPlayer();
  return useSyncExternalStore(p.subscribe, p.getState);
}

export function usePlaybackTime(): TimeState {
  const p = getPlayer();
  return useSyncExternalStore(p.subscribeTime, p.getTime);
}
