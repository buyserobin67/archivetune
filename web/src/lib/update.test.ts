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

  it('check() says "current" when nothing new exists and the server agrees', async () => {
    const m = new UpdateManager(new C(), vi.fn(), 4000, async () => ({ version: '1', build: 'aaa' }), 'aaa');
    const r = new Reg(); m.attach(r);
    expect(await m.check(10)).toEqual({ kind: 'current' });
    expect(m.getState()).toMatchObject({ lastChecked: 10, error: null, checking: false, outcome: { kind: 'current' } });
  });

  it('check() reports a newer deployed build the phone has not received, instead of silently saying "up to date"', async () => {
    const m = new UpdateManager(new C(), vi.fn(), 4000, async () => ({ version: '0.9.0', build: 'bbb' }), 'aaa');
    m.attach(new Reg());
    expect(await m.check()).toEqual({ kind: 'behind', remoteVersion: '0.9.0', remoteBuild: 'bbb' });
  });

  it('check() waits for a new version to finish downloading and then reports it ready', async () => {
    const c = new C(), r = new Reg(), m = new UpdateManager(c, vi.fn());
    m.attach(r);
    const w = new W();
    r.update.mockImplementation(async () => { r.found(w); setTimeout(() => w.set('installed'), 5); });
    expect(await m.check()).toEqual({ kind: 'ready' });
    expect(m.getState()).toMatchObject({ ready: true, installing: false });
  });

  it('check() finds an update that is already waiting', async () => {
    const c = new C(), r = new Reg(), m = new UpdateManager(c, vi.fn());
    m.attach(r);
    r.update.mockImplementation(async () => { r.waiting = new W(); });
    expect(await m.check()).toEqual({ kind: 'ready' });
    expect(m.getState().ready).toBe(true);
  });

  it('check() reports failure (offline) without throwing, and an unreachable version file is not an error', async () => {
    const r = new Reg(), m = new UpdateManager(new C(), vi.fn(), 4000, async () => { throw new Error('x'); }, 'aaa');
    m.attach(r);
    expect(await m.check(10)).toEqual({ kind: 'current' });
    r.update.mockRejectedValueOnce(new Error('offline'));
    expect(await m.check(20)).toEqual({ kind: 'offline', message: 'offline' });
    expect(m.getState()).toMatchObject({ lastChecked: 20, error: 'offline', checking: false });
  });
});

describe('classifyOrigin', () => {
  it('tells production, preview, local and custom addresses apart', () => {
    expect(classifyOrigin('cadence.pages.dev').kind).toBe('production');
    expect(classifyOrigin('abc123.cadence.pages.dev').kind).toBe('preview');
    expect(classifyOrigin('claude-cadence-web-persistence.cadence.pages.dev').kind).toBe('preview');
    expect(classifyOrigin('localhost').kind).toBe('local');
    expect(classifyOrigin('127.0.0.1').kind).toBe('local');
    expect(classifyOrigin('music.example.com').kind).toBe('custom');
  });
});
