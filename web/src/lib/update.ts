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
  /** A newer version was found and is downloading. */
  installing: boolean;
  lastChecked: number | null;
  /** What went wrong with the last check or install, in words for the user. null when nothing did. */
  error: string | null;
  /** The last failure happened because the device could not reach the server. */
  offline: boolean;
  /** The user tapped Restart and the switch is in progress. */
  applying: boolean;
}

const EMPTY: UpdateState = { ready: false, checking: false, installing: false, lastChecked: null, error: null, offline: false, applying: false };

export class UpdateManager {
  private state: UpdateState = { ...EMPTY };
  private listeners = new Set<() => void>();
  private reg: RegistrationLike | null = null;
  private waiting: WorkerLike | null = null;
  private reloaded = false;

  /**
   * `reachable` says whether the server answers at all, so a failed check is only called "offline" when it is.
   * The default assumes it does not (tests); the app passes a real probe.
   */
  constructor(private container: ContainerLike, private reload: () => void, private fallbackMs = 4000, private reachable: () => Promise<boolean> = async () => false) {
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
    let installed = false;
    const check = () => {
      if (worker.state === 'installing') this.set({ installing: true, error: null, offline: false });
      if (worker.state === 'installed' || worker.state === 'activating' || worker.state === 'activated') {
        installed = true;
        this.set({ installing: false });
        if (worker.state === 'installed' && this.container.controller) this.markReady(worker);
      }
      // A worker that turns redundant before it ever installed failed its install (a file it needs could not be fetched).
      if (worker.state === 'redundant' && !installed) this.set({ installing: false, error: 'A new version was found but could not be installed. Try again later.', offline: false });
    };
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
    this.set({ checking: true, error: null, offline: false });
    try {
      await this.reg.update();
      this.set({ lastChecked: now });
    } catch (e) {
      // Safari also rejects here when the new version fails to install, not only when there is no network.
      const online = await this.reachable().catch(() => false);
      const reason = e instanceof Error && e.message ? e.message : 'unknown error';
      this.set({
        lastChecked: now,
        offline: !online,
        error: online ? `The update could not be installed (${reason}). Try again later.` : 'Could not reach the server. Check your connection and try again.',
      });
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
  // Asks the server for the worker script, skipping every cache. Any HTTP answer means we are online.
  const reachable = () => fetch(`${base}sw.js`, { cache: 'no-store' }).then(() => true, () => false);
  manager = new UpdateManager(navigator.serviceWorker, () => location.reload(), 4000, reachable);
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
