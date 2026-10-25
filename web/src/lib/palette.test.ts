import { describe, expect, it } from 'vitest';
import { hslToRgb, paletteFromPixels, rgbToHsl, seedPalette, type RGB } from './palette';

const fill = (colors: RGB[], count = 100) => {
  const data = new Uint8ClampedArray(colors.length * count * 4);
  let o = 0;
  for (const c of colors) for (let i = 0; i < count; i++) { data.set([...c, 255], o); o += 4; }
  return data;
};

describe('palette extraction', () => {
  it('round-trips hsl <-> rgb', () => {
    for (const c of [[200, 40, 40], [20, 180, 90], [90, 90, 200]] as RGB[]) {
      const [h, s, l] = rgbToHsl(c);
      const back = hslToRgb(h, s, l);
      back.forEach((v, i) => expect(Math.abs(v - c[i])).toBeLessThanOrEqual(1));
    }
  });

  it('picks the dominant colourful hue and ignores black/white', () => {
    const p = paletteFromPixels(fill([[0, 0, 0], [255, 255, 255], [220, 30, 40], [220, 30, 40], [30, 200, 60]], 60))!;
    const [h] = rgbToHsl(p.accent);
    expect(h < 20 || h > 340).toBe(true); // red wins
  });

  it('keeps accents legible: mid lightness for fills, light for text, dark tint for backgrounds', () => {
    const p = paletteFromPixels(fill([[40, 60, 200]]))!;
    expect(rgbToHsl(p.accent)[2]).toBeGreaterThan(0.45);
    expect(rgbToHsl(p.accent)[2]).toBeLessThan(0.65);
    expect(rgbToHsl(p.accentText)[2]).toBeGreaterThan(0.7);
    expect(rgbToHsl(p.tint)[2]).toBeLessThan(0.2);
  });

  it('second accent differs in hue when the cover has two colours', () => {
    const p = paletteFromPixels(fill([[220, 30, 40], [30, 90, 220]], 100))!;
    expect(Math.abs(rgbToHsl(p.accent)[0] - rgbToHsl(p.accent2)[0])).toBeGreaterThan(40);
  });

  it('returns null for greyscale or transparent art so callers can fall back', () => {
    expect(paletteFromPixels(fill([[120, 120, 120], [10, 10, 10]]))).toBeNull();
    expect(paletteFromPixels(new Uint8ClampedArray(400))).toBeNull();
  });

  it('seed palettes are deterministic and varied', () => {
    expect(seedPalette('Album A')).toEqual(seedPalette('Album A'));
    const hues = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((s) => seedPalette(s).accent.join()));
    expect(hues.size).toBeGreaterThan(2);
  });
});
