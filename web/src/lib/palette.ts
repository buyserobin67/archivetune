import { db as defaultDb, type CadenceDB } from './db';

export type RGB = [number, number, number];

export interface Palette {
  /** Saturated, mid-lightness. For fills, glows, active states. */
  accent: RGB;
  /** Second hue for gradients. */
  accent2: RGB;
  /** Accent lightened for use as text/icons on near-black. */
  accentText: RGB;
  /** Very dark tint of the artwork, for backgrounds. */
  tint: RGB;
}

export const DEFAULT_PALETTE: Palette = {
  accent: [150, 150, 160],
  accent2: [90, 90, 100],
  accentText: [210, 210, 220],
  tint: [40, 42, 48],
};

// ---- colour maths (pure, unit-tested) ----

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

function build(h: number, s: number, h2: number): Palette {
  const sat = clamp(s, 0.5, 0.88);
  return {
    accent: hslToRgb(h, sat, 0.56),
    accent2: hslToRgb(h2, clamp(sat * 0.9, 0.4, 0.8), 0.4),
    accentText: hslToRgb(h, clamp(sat, 0.5, 0.9), 0.78),
    tint: hslToRgb(h, clamp(sat * 0.7, 0.3, 0.6), 0.14),
  };
}

/**
 * Picks accent colours from RGBA pixels (e.g. a 24x24 downsample of the cover).
 * Hue histogram weighted by saturation and by how far from black/white a pixel is,
 * so a mostly-grey cover with one coloured object still picks that object.
 */
export function paletteFromPixels(data: ArrayLike<number>): Palette | null {
  const BINS = 24;
  const w = new Array<number>(BINS).fill(0);
  const sSum = new Array<number>(BINS).fill(0);
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const [h, s, l] = rgbToHsl([data[i], data[i + 1], data[i + 2]]);
    if (l < 0.1 || l > 0.93 || s < 0.18) continue;
    const weight = s * s * (1 - Math.abs(l - 0.5) * 1.4);
    const bin = Math.floor((h / 360) * BINS) % BINS;
    w[bin] += weight;
    sSum[bin] += weight * s;
  }
  let best = -1;
  for (let i = 0; i < BINS; i++) if (best < 0 || w[i] > w[best]) best = i;
  if (best < 0 || w[best] < 0.5) return null; // too little colour: caller falls back
  const hue = (best + 0.5) * (360 / BINS);
  const sat = sSum[best] / w[best];
  let second = -1;
  for (let i = 0; i < BINS; i++) {
    if (hueDist((i + 0.5) * (360 / BINS), hue) < 40) continue;
    if (second < 0 || w[i] > w[second]) second = i;
  }
  const h2 = second >= 0 && w[second] > w[best] * 0.25 ? (second + 0.5) * (360 / BINS) : hue + 35;
  return build(hue, sat, h2);
}

/** Deterministic palette for tracks without artwork, kept in the violet/blue/magenta/teal range. */
export function seedPalette(seed: string): Palette {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  const hues = [262, 280, 305, 330, 222, 200, 175];
  const h = hues[n % hues.length];
  return build(h, 0.62, h + 38);
}

export const rgbCss = (c: RGB) => `${c[0]} ${c[1]} ${c[2]}`;

// ---- browser side ----

const cache = new Map<string, Promise<Palette | null>>();

async function decode(blob: Blob): Promise<Uint8ClampedArray | null> {
  try {
    const size = 24;
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, size, size);
    bmp.close?.();
    return ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }
}

/** Palette for a track's cover art, cached per session. null when there is no usable art. */
export function getArtPalette(trackId: string, d: CadenceDB = defaultDb): Promise<Palette | null> {
  let p = cache.get(trackId);
  if (!p) {
    p = d.art.get(trackId).then(async (row) => {
      if (!row) return null;
      const px = await decode(row.blob);
      return px ? paletteFromPixels(px) : null;
    }).catch(() => null);
    cache.set(trackId, p);
  }
  return p;
}

const thumbs = new Map<string, Promise<string | null>>();

/** 16x16 data-URL of the cover. Scaled up and softly blurred it makes the ambient player background. */
export function getArtThumb(trackId: string, d: CadenceDB = defaultDb): Promise<string | null> {
  let p = thumbs.get(trackId);
  if (!p) {
    p = d.art.get(trackId).then(async (row) => {
      if (!row) return null;
      const bmp = await createImageBitmap(row.blob);
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      c.getContext('2d')?.drawImage(bmp, 0, 0, 16, 16);
      bmp.close?.();
      return c.toDataURL('image/jpeg', 0.7);
    }).catch(() => null);
    thumbs.set(trackId, p);
  }
  return p;
}
