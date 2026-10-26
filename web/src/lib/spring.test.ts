import { describe, expect, it } from 'vitest';
import { springEasing } from './spring';

describe('spring easing', () => {
  it('starts at 0, ends at 1, overshoots a little and settles in under a second', () => {
    const { easing, duration } = springEasing(190, 21);
    const pts = easing.slice(7, -1).split(', ').map(Number);
    expect(pts[0]).toBe(0);
    expect(pts[pts.length - 1]).toBe(1);
    const peak = Math.max(...pts);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.06);
    expect(duration).toBeGreaterThan(300);
    expect(duration).toBeLessThan(1000);
  });
});
