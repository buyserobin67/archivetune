import { useSyncExternalStore } from 'react';
import { APP_BUILD } from './appInfo';

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

export type CheckOutcome =
  | { kind: 'ready' }                                   // an update is downloaded and waiting for Restart
  | { kind: 'current' }                                 // this is the newest deployed build
  | { kind: 'behind'; remoteVersion: string; remoteBuild: string } // a newer build is deployed but this phone has not received it yet
  | { kind: 'offline'; message: string };

export interface RemoteVersion { version: string; build: string }

export interface UpdateState {
  /** A newer version is installed and waiting. */
  ready: boolean;
  checking: boolean;
  lastChecked: number | null;
  /** Set when the last check failed (usually: offline). */
  error: string | null;
  /** The user tapped Restart and the switch is in progress. */
  applying: boolean;
  /** A newer worker is downloading right now. */
  installing: boolean;
  /** What the last check found. */
  outcome: CheckOutcome | null;
}

export class UpdateManager {
  private state: UpdateState = { ready: false, checking: false, lastChecked: null, error: null, applying: false, installing: false, outcome: null };
  private listeners = new Set<() => void>();
  private reg: RegistrationLike | null = null;
  private waiting: WorkerLike | null = null;
  private reloaded = false;

  constructor(private container: ContainerLike, private reload: () => void, private fallbackMs = 4000, private fetchRemote: () => Promise<RemoteVersion | null> = async () => null, private ownBuild = '', private installWaitMs = 20000) {
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

  /**
   * Looks for a newer deploy and says clearly what it found. Waits for a new version to finish downloading so the
   * answer is real, and also asks the server which build is deployed so "up to date" is never a guess.
   */
  async check(now = Date.now()): Promise<CheckOutcome | null> {
    if (!this.reg || this.state.checking) return null;
    this.set({ checking: true, error: null, outcome: null });
    let outcome: CheckOutcome;
    try {
      await this.reg.update();
      if (this.reg.installing && !this.state.ready) {
        this.set({ installing: true });
        await this.untilSettled(this.reg.installing);
        this.set({ installing: false });
      }
      if (this.state.ready || this.reg.waiting) {
        outcome = { kind: 'ready' };
        if (!this.state.ready && this.reg.waiting && this.container.controller) this.markReady(this.reg.waiting);
      } else {
        const remote = await this.fetchRemote().catch(() => null);
        outcome = remote && this.ownBuild && remote.build !== this.ownBuild
          ? { kind: 'behind', remoteVersion: remote.version, remoteBuild: remote.build }
          : { kind: 'current' };
      }
      this.set({ lastChecked: now, outcome });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not check for updates';
      outcome = { kind: 'offline', message };
      this.set({ error: message, lastChecked: now, outcome, installing: false });
    } finally {
      this.set({ checking: false });
    }
    return outcome;
  }

  private untilSettled(worker: WorkerLike): Promise<void> {
    return new Promise((resolve) => {
      const done = () => { if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') resolve(); };
      done();
      worker.addEventListener('statechange', done);
      setTimeout(resolve, this.installWaitMs);
    });
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

/** Which build is deployed right now (never cached). null when it cannot be reached. */
export async function fetchDeployedVersion(): Promise<RemoteVersion | null> {
  const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const j = (await res.json()) as Partial<RemoteVersion>;
  return j.build ? { version: String(j.version ?? ''), build: String(j.build) } : null;
}

export function getUpdateManager(): UpdateManager | null {
  return manager;
}

/** Registers the worker (production builds only) and wires update checks. Never unregisters anything. */
export function initUpdates(): void {
  if (manager || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const base = import.meta.env.BASE_URL;
  manager = new UpdateManager(navigator.serviceWorker, () => location.reload(), 4000, fetchDeployedVersion, APP_BUILD);
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

const EMPTY: UpdateState = { ready: false, checking: false, lastChecked: null, error: null, applying: false, installing: false, outcome: null };
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
