import { describe, expect, it } from 'vitest';
import { centred, clampPan, panFor, sourceSquare, zoomAround } from './crop';

describe('crop cover maths', () => {
  it('starts on the centred square, like the app shows covers', () => {
    expect(sourceSquare(1280, 720, 300, centred(1280, 720, 300))).toEqual({ x: 280, y: 0, w: 720, h: 720 });
  });

  it('never lets empty space into the frame', () => {
    const p = clampPan(1280, 720, 300, { zoom: 1, ox: 100, oy: -50 });
    expect(p.ox).toBe(0);
    expect(p.oy).toBe(0);
    const far = clampPan(1280, 720, 300, { zoom: 1, ox: -10_000, oy: 0 });
    expect(sourceSquare(1280, 720, 300, far)).toEqual({ x: 560, y: 0, w: 720, h: 720 });
  });

  it('zooms in around the pinch point and round-trips a saved square', () => {
    const z = zoomAround(1280, 720, 300, centred(1280, 720, 300), 2);
    const r = sourceSquare(1280, 720, 300, z);
    expect(r.w).toBeCloseTo(360);
    expect(r.x + r.w / 2).toBeCloseTo(640);
    expect(r.y + r.h / 2).toBeCloseTo(360);
    const back = sourceSquare(1280, 720, 300, panFor(1280, 720, 300, { x: 100, y: 50, w: 400, h: 400 }));
    expect(back.x).toBeCloseTo(100);
    expect(back.y).toBeCloseTo(50);
    expect(back.w).toBeCloseTo(400);
  });
});
