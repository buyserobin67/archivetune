import { CadenceDB } from '../lib/db';
import type { AudioLike } from '../lib/player';
import type { MetaParser } from '../lib/metadata';

let n = 0;
export const makeDb = () => new CadenceDB(`test-${Date.now()}-${n++}-${Math.random().toString(36).slice(2)}`);

/** Deterministic fake audio bytes. */
export function audioFile(name: string, content: string, type = 'audio/mpeg'): File {
  return new File([new TextEncoder().encode(content)], name, { type });
}

export const fakeParser = (over: Partial<Awaited<ReturnType<MetaParser>>> = {}): MetaParser => async (_f, name) => ({
  title: name.replace(/\.\w+$/, ''), artist: 'Test Artist', album: 'Test Album', duration: 120, ...over,
});

export class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  duration = 100;
  paused = true;
  ended = false;
  preload = '';
  volume = 1;
  playCalls = 0;
  failPlayWith: string | null = null;
  play = async () => {
    this.playCalls++;
    if (this.failPlayWith) { const e = new Error('x'); e.name = this.failPlayWith; throw e; }
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('playing'));
  };
  pause = () => { if (this.paused) return; this.paused = true; this.dispatchEvent(new Event('pause')); };
  load = () => {};
  removeAttribute = (_: string) => { this.src = ''; };
  finish() { this.ended = true; this.paused = true; this.dispatchEvent(new Event('ended')); this.ended = false; }
  asAudio() { return this as unknown as AudioLike; }
}

export class FakeMediaSession {
  metadata: unknown = null;
  playbackState: 'none' | 'paused' | 'playing' = 'none';
  handlers = new Map<string, (d?: unknown) => void>();
  position: unknown = null;
  setActionHandler(a: string, h: ((d?: unknown) => void) | null) { if (h) this.handlers.set(a, h); else this.handlers.delete(a); }
  setPositionState(s?: unknown) { this.position = s; }
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
