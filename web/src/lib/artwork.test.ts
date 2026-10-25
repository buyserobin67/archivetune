import { describe, expect, it } from 'vitest';
import { detectBorders, isTrimWorthIt, scaleRect, verdict } from './artwork';

type RGBA = [number, number, number, number];
/** Builds an RGBA buffer from a per-pixel function. */
const img = (w: number, h: number, fn: (x: number, y: number) => RGBA) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(fn(x, y), (y * w + x) * 4);
  return d;
};
// Deterministic "photo": every pixel differs from its neighbours, so it is never mistaken for a flat border.
const photo = (x: number, y: number): RGBA => [(x * 37 + y * 11) % 200 + 20, (x * 13 + y * 29) % 200 + 20, (x * 7 + y * 53) % 200 + 20, 255];

describe('artwork border detection', () => {
  it('finds the transparent bands of the reported cover: a 16:9 frame centred in a square', () => {
    const S = 160, fh = 90, y0 = (S - fh) / 2;
    const d = img(S, S, (x, y) => (y < y0 || y >= y0 + fh ? [0, 0, 0, 0] : photo(x, y)));
    const r = detectBorders(d, S, S);
    expect(r.kind).toBe('transparent');
    expect(r.hasAlpha).toBe(true);
    expect(r.borders).toEqual({ top: 35, bottom: 35, left: 0, right: 0 });
    expect(r.content).toEqual({ x: 0, y: 35, w: 160, h: 90 });
    expect(r.contentAspect).toBeCloseTo(16 / 9, 2);
    expect(r.transparentShare).toBeCloseTo(70 / 160, 2);
    expect(isTrimWorthIt(r)).toBe(true);
    expect(verdict(r)).toMatch(/Transparent border: 35px top, 35px bottom/);
  });

  it('treats "transparent" rows with invisible RGB as transparent (alpha is what matters)', () => {
    const d = img(100, 100, (x, y) => (y < 20 ? [255, 0, 255, 3] : photo(x, y)));
    expect(detectBorders(d, 100, 100).borders.top).toBe(20);
  });

  it('transparent borders on all four sides', () => {
    const d = img(120, 100, (x, y) => (x < 10 || x >= 110 || y < 8 || y >= 92 ? [0, 0, 0, 0] : photo(x, y)));
    expect(detectBorders(d, 120, 100).borders).toEqual({ top: 8, bottom: 8, left: 10, right: 10 });
  });

  it('leaves a clean opaque photo alone', () => {
    const r = detectBorders(img(120, 120, photo), 120, 120, { flat: true });
    expect(r.kind).toBeNull();
    expect(r.content).toEqual({ x: 0, y: 0, w: 120, h: 120 });
    expect(isTrimWorthIt(r)).toBe(false);
    expect(verdict(r)).toMatch(/Clean square/);
  });

  it('a landscape photo with no border is reported as such, not trimmed', () => {
    const r = detectBorders(img(160, 90, photo), 160, 90, { flat: true });
    expect(r.kind).toBeNull();
    expect(verdict(r)).toMatch(/Landscape image, no borders/);
  });

  it('flat-colour letterbox (opaque bars) is found only when asked for', () => {
    const d = img(100, 100, (x, y) => (y < 22 || y >= 78 ? [36, 38, 41, 255] : photo(x, y)));
    expect(detectBorders(d, 100, 100).kind).toBeNull(); // default: flat colour may be intentional design
    const r = detectBorders(d, 100, 100, { flat: true });
    expect(r.kind).toBe('flat');
    expect(r.borders).toMatchObject({ top: 22, bottom: 22 });
    expect(r.flatColor).toBe('#242629');
  });

  it('flat pillarbox (side bars) is found', () => {
    const d = img(160, 90, (x, y) => (x < 40 || x >= 120 ? [48, 62, 44, 255] : photo(x, y)));
    const r = detectBorders(d, 160, 90, { flat: true });
    expect(r.borders).toMatchObject({ left: 40, right: 40, top: 0, bottom: 0 });
    expect(r.content).toEqual({ x: 40, y: 0, w: 80, h: 90 });
  });

  it('ignores hairline borders and noise', () => {
    const d = img(200, 200, (x, y) => (y === 0 ? [0, 0, 0, 0] : photo(x, y)));
    expect(detectBorders(d, 200, 200).kind).toBeNull(); // 1px of 200 is < 2%
  });

  it('refuses to crop away (almost) the whole image', () => {
    expect(detectBorders(img(100, 100, () => [0, 0, 0, 0]), 100, 100).kind).toBeNull();
    const d = img(100, 100, (x, y) => (y < 45 || y >= 55 ? [0, 0, 0, 0] : photo(x, y)));
    expect(detectBorders(d, 100, 100).kind).toBeNull(); // would keep only 10% of the height
  });

  it('survives tiny and empty inputs', () => {
    expect(detectBorders(new Uint8ClampedArray(0), 0, 0).kind).toBeNull();
    expect(detectBorders(img(4, 4, photo), 4, 4).kind).toBeNull();
  });

  it('a transparent corner or logo does not count as a border (whole rows must be empty)', () => {
    const d = img(100, 100, (x, y) => (x < 30 && y < 30 ? [0, 0, 0, 0] : photo(x, y)));
    expect(detectBorders(d, 100, 100).kind).toBeNull();
  });

  it('scales a rect from the analysis copy back to the source and clamps it', () => {
    expect(scaleRect({ x: 0, y: 35, w: 160, h: 90 }, 160, 160, 1280, 1280)).toEqual({ x: 0, y: 280, w: 1280, h: 720 });
    expect(scaleRect({ x: 10, y: 10, w: 999, h: 999 }, 100, 100, 200, 200)).toEqual({ x: 20, y: 20, w: 180, h: 180 });
  });
});
