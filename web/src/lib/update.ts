import { useSyncExternalStore } from 'react';

/**
 * App updates, without touching your data.
 *
 * A new deploy installs in the background and waits. When it is ready the app shows
 * "New Cadence version available — Restart to update." Only when you tap Restart is the waiting worker
 * activated and the page reloaded. IndexedDB (your music, playlists, lyrics, queue) is never involved.
 */

export interface WorkerLike {
  state: string;
  postMessage(msg: unknown): void;
  addEventListener(type: 'statechange', fn: () => void): void;
}
export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  addEventListener(type: 'updatefound', fn: () => void): void;
  update(): Promise<unknown>;
}
export interface ContainerLike {
  controller: unknown;
  addEventListener(type: 'controllerchange', fn: () => void): void;
}

export interface UpdateState {
  /** A newer version is installed and waiting. */
  ready: boolean;
  checking: boolean;
  lastChecked: number | null;
  /** Set when the last check failed (usually: offline). */
  error: string | null;
  /** The user tapped Restart and the switch is in progress. */
  applying: boolean;
}

export class UpdateManager {
  private state: UpdateState = { ready: false, checking: false, lastChecked: null, error: null, applying: false };
  private listeners = new Set<() => void>();
  private reg: RegistrationLike | null = null;
  private waiting: WorkerLike | null = null;
  private reloaded = false;

  constructor(private container: ContainerLike, private reload: () => void, private fallbackMs = 4000) {
    container.addEventListener('controllerchange', () => {
      // The waiting worker took over (we asked it to). Reload exactly once to run the new files.
      if (this.state.applying) this.doReload();
    });
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getState = () => this.state;
  private set(p: Partial<UpdateState>) { this.state = { ...this.state, ...p }; this.listeners.forEach((l) => l()); }

  attach(reg: RegistrationLike): void {
    this.reg = reg;
    if (reg.waiting && this.container.controller) this.markReady(reg.waiting);
    if (reg.installing) this.track(reg.installing);
    reg.addEventListener('updatefound', () => { if (reg.installing) this.track(reg.installing); });
  }

  private track(worker: WorkerLike): void {
    const check = () => { if (worker.state === 'installed' && this.container.controller) this.markReady(worker); };
    check();
    worker.addEventListener('statechange', check);
  }

  private markReady(worker: WorkerLike): void {
    this.waiting = worker;
    this.set({ ready: true });
  }

  /** Asks the browser to look for a newer deploy. Safe to call often. */
  async check(now = Date.now()): Promise<void> {
    if (!this.reg || this.state.checking) return;
    this.set({ checking: true, error: null });
    try {
      await this.reg.update();
      this.set({ lastChecked: now });
    } catch (e) {
      this.set({ error: e instanceof Error ? e.message : 'Could not check for updates', lastChecked: now });
    } finally {
      this.set({ checking: false });
    }
  }

  /** Activates the waiting version and reloads. Call `beforeSwitch` to save playback position etc. */
  async apply(beforeSwitch?: () => Promise<void> | void): Promise<void> {
    const w = this.waiting;
    if (!w || this.state.applying) return;
    this.set({ applying: true });
    try { await beforeSwitch?.(); } catch { /* never block an update on this */ }
    w.postMessage({ type: 'SKIP_WAITING' });
    // controllerchange normally fires within milliseconds; reload anyway if it somehow does not.
    setTimeout(() => this.doReload(), this.fallbackMs);
  }

  private doReload(): void {
    if (this.reloaded) return;
    this.reloaded = true;
    this.reload();
  }
}

// ---- the app-wide instance ----

let manager: UpdateManager | null = null;
const CHECK_EVERY_MS = 30 * 60 * 1000;
const MIN_GAP_MS = 5 * 60 * 1000;

export function getUpdateManager(): UpdateManager | null {
  return manager;
}

/** Registers the worker (production builds only) and wires update checks. Never unregisters anything. */
export function initUpdates(): void {
  if (manager || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const base = import.meta.env.BASE_URL;
  manager = new UpdateManager(navigator.serviceWorker, () => location.reload());
  const m = manager;
  const go = () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then((reg) => {
      m.attach(reg);
      void m.check();
    }).catch((e) => console.warn('Service worker registration failed', e));
  };
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  // iOS keeps Home Screen apps alive for days: look again whenever the app comes to the front or the network returns.
  const maybe = () => { const s = m.getState(); if (!s.lastChecked || Date.now() - s.lastChecked > MIN_GAP_MS) void m.check(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') maybe(); });
  window.addEventListener('online', maybe);
  setInterval(maybe, CHECK_EVERY_MS);
}

const EMPTY: UpdateState = { ready: false, checking: false, lastChecked: null, error: null, applying: false };
const NOOP_SUB = () => () => {};

export function useAppUpdate(): UpdateState {
  return useSyncExternalStore(manager ? manager.subscribe : NOOP_SUB, manager ? manager.getState : () => EMPTY);
}

/** Version string of the worker that currently controls this page (asks the worker; null if none or no answer). */
export async function getActiveWorkerVersion(): Promise<string | null> {
  const c = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
  if (!c) return null;
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), 1200);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve((e.data as { version?: string })?.version ?? null); };
    c.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
  });
}
