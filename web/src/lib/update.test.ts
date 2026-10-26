import { describe, expect, it, vi } from 'vitest';
import { UpdateManager, type ContainerLike, type RegistrationLike, type WorkerLike } from './update';
import { classifyOrigin } from './origin';

class W implements WorkerLike {
  state = 'installing';
  sent: unknown[] = [];
  private l: (() => void)[] = [];
  postMessage(m: unknown) { this.sent.push(m); }
  addEventListener(_t: 'statechange', fn: () => void) { this.l.push(fn); }
  set(s: string) { this.state = s; this.l.forEach((f) => f()); }
}
class Reg implements RegistrationLike {
  waiting: WorkerLike | null = null;
  installing: WorkerLike | null = null;
  private l: (() => void)[] = [];
  addEventListener(_t: 'updatefound', fn: () => void) { this.l.push(fn); }
  found(w: W) { this.installing = w; this.l.forEach((f) => f()); }
  update = vi.fn(async () => {});
}
class C implements ContainerLike {
  controller: unknown = {};
  private l: (() => void)[] = [];
  addEventListener(_t: 'controllerchange', fn: () => void) { this.l.push(fn); }
  change() { this.l.forEach((f) => f()); }
}

describe('UpdateManager', () => {
  it('shows nothing until a new version has finished installing, and never reloads by itself', () => {
    const c = new C(), r = new Reg(), reload = vi.fn();
    const m = new UpdateManager(c, reload);
    m.attach(r);
    expect(m.getState().ready).toBe(false);
    const w = new W(); r.found(w);
    expect(m.getState().ready).toBe(false);
    w.set('installed');
    expect(m.getState().ready).toBe(true);
    c.change(); // a controller change we did not ask for must not reload mid-song
    expect(reload).not.toHaveBeenCalled();
  });

  it('a first install (no controller yet) is not announced as an update', () => {
    const c = new C(); c.controller = null;
    const r = new Reg(), m = new UpdateManager(c, vi.fn());
    m.attach(r);
    const w = new W(); r.found(w); w.set('installed');
    expect(m.getState().ready).toBe(false);
  });

  it('picks up a version that was already waiting when the app opened', () => {
    const c = new C(), r = new Reg();
    r.waiting = new W();
    const m = new UpdateManager(c, vi.fn());
    m.attach(r);
    expect(m.getState().ready).toBe(true);
  });

  it('Restart saves first, asks the waiting worker to take over, and reloads exactly once', async () => {
    const c = new C(), r = new Reg(), reload = vi.fn();
    const m = new UpdateManager(c, reload);
    m.attach(r);
    const w = new W(); r.found(w); w.set('installed');
    const order: string[] = [];
    await m.apply(async () => { order.push('save'); });
    expect(w.sent).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(order).toEqual(['save']);
    c.change(); c.change();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads anyway if the worker never reports a controller change', async () => {
    vi.useFakeTimers();
    const c = new C(), r = new Reg(), reload = vi.fn();
    const m = new UpdateManager(c, reload, 100);
    m.attach(r);
    const w = new W(); r.found(w); w.set('installed');
    await m.apply();
    vi.advanceTimersByTime(150);
    expect(reload).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('a failing save step does not block the update', async () => {
    const c = new C(), r = new Reg(), m = new UpdateManager(c, vi.fn());
    m.attach(r);
    const w = new W(); r.found(w); w.set('installed');
    await m.apply(async () => { throw new Error('boom'); });
    expect(w.sent).toHaveLength(1);
  });

  it('check() records success and reports failure (offline) without throwing', async () => {
    const c = new C(), r = new Reg(), m = new UpdateManager(c, vi.fn());
    m.attach(r);
    await m.check(10);
    expect(m.getState()).toMatchObject({ lastChecked: 10, error: null, checking: false });
    r.update.mockRejectedValueOnce(new TypeError('Load failed'));
    await m.check(20);
    expect(m.getState()).toMatchObject({ lastChecked: 20, offline: true, checking: false });
    expect(m.getState().error).toMatch(/Could not reach the server/);
  });

  it('only says offline when the server really cannot be reached', async () => {
    const c = new C(), r = new Reg(), m = new UpdateManager(c, vi.fn(), 4000, async () => true);
    m.attach(r);
    r.update.mockRejectedValueOnce(new TypeError('Script resource evaluation failed'));
    await m.check(30);
    expect(m.getState().offline).toBe(false);
    expect(m.getState().error).toMatch(/could not be installed \(Script resource evaluation failed\)/);
    await m.check(40); // a later good check clears it
    expect(m.getState()).toMatchObject({ error: null, offline: false });
  });

  it('shows a download in progress, and a failed install instead of "Up to date"', () => {
    const c = new C(), r = new Reg(), m = new UpdateManager(c, vi.fn());
    m.attach(r);
    const w = new W(); r.found(w);
    expect(m.getState().installing).toBe(true);
    w.set('redundant');
    expect(m.getState()).toMatchObject({ installing: false, ready: false });
    expect(m.getState().error).toMatch(/could not be installed/);
    const ok = new W(); r.found(ok); ok.set('installed');
    expect(m.getState()).toMatchObject({ installing: false, ready: true, error: null });
  });
});

describe('classifyOrigin', () => {
  it('tells production, preview, local and custom addresses apart', () => {
    expect(classifyOrigin('cadence.pages.dev').kind).toBe('production');
    expect(classifyOrigin('abc123.cadence.pages.dev').kind).toBe('preview');
    const snap = classifyOrigin('5e356954.cadence-music-bj8.pages.dev', 'claude/cadence-web-polish');
    expect(snap.kind).toBe('snapshot');
    expect(snap.liveUrls).toEqual([
      { label: 'Latest of claude/cadence-web-polish', url: 'https://claude-cadence-web-polish.cadence-music-bj8.pages.dev/' },
      { label: 'Main address', url: 'https://cadence-music-bj8.pages.dev/' },
    ]);
    expect(classifyOrigin('5e356954.cadence-music-bj8.pages.dev').liveUrls).toEqual([{ label: 'Main address', url: 'https://cadence-music-bj8.pages.dev/' }]);
    expect(classifyOrigin('claude-cadence-web-persistence.cadence.pages.dev').kind).toBe('preview');
    expect(classifyOrigin('localhost').kind).toBe('local');
    expect(classifyOrigin('127.0.0.1').kind).toBe('local');
    expect(classifyOrigin('music.example.com').kind).toBe('custom');
  });
});
