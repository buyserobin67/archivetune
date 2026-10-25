/**
 * Artwork border analysis. Pure functions over RGBA pixels, so they are unit-tested without a browser.
 *
 * Why this exists: some embedded covers are a square canvas with a 16:9 picture in the middle and
 * fully transparent rows above and below. Transparent pixels show whatever is behind the image (our
 * card colour in the app, white in iOS's Now Playing UI), which reads as grey/white bars. CSS
 * object-fit cannot remove pixels that are part of the image, so the borders have to be detected
 * and the picture trimmed (non-destructively; the original bytes are kept).
 */

export type BorderKind = 'transparent' | 'flat';

export interface Rect { x: number; y: number; w: number; h: number }

export interface BorderReport {
  width: number;
  height: number;
  /** Any pixel with alpha < 255. */
  hasAlpha: boolean;
  /** Share of pixels that are (nearly) fully transparent, 0..1. */
  transparentShare: number;
  /** Detected border thickness in source pixels. */
  borders: { top: number; bottom: number; left: number; right: number };
  kind: BorderKind | null;
  /** Picture area without borders, in source pixels. */
  content: Rect;
  /** Width / height of the picture area. */
  contentAspect: number;
  /** Colour of flat borders (#rrggbb), when kind is 'flat'. */
  flatColor?: string;
}

export interface DetectOptions {
  /** Alpha at or below this counts as transparent. */
  alphaCutoff?: number;
  /** Per-channel tolerance for "same flat colour". */
  tolerance?: number;
  /** Share of a row/column that must match to call it border. */
  coverage?: number;
  /** Detect flat-colour borders as well as transparent ones. */
  flat?: boolean;
  /** Ignore borders thinner than this share of the dimension. */
  minShare?: number;
}

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * Finds borders on all four sides. Transparent borders are always reported; flat-colour borders only with
 * `flat: true`, because a flat colour can be intentional design (a black frame) while transparent pixels never are.
 */
export function detectBorders(data: ArrayLike<number>, width: number, height: number, opts: DetectOptions = {}): BorderReport {
  const cutoff = opts.alphaCutoff ?? 8, tol = opts.tolerance ?? 6, cov = opts.coverage ?? 0.985, minShare = opts.minShare ?? 0.02;
  const px = (x: number, y: number) => (y * width + x) * 4;
  const isTransparent = (x: number, y: number) => data[px(x, y) + 3] <= cutoff;

  let transparent = 0, hasAlpha = false;
  for (let i = 3; i < width * height * 4; i += 4) { if (data[i] < 255) hasAlpha = true; if (data[i] <= cutoff) transparent++; }
  const base: BorderReport = {
    width, height, hasAlpha, transparentShare: width * height ? transparent / (width * height) : 0,
    borders: { top: 0, bottom: 0, left: 0, right: 0 }, kind: null, content: { x: 0, y: 0, w: width, h: height }, contentAspect: height ? width / height : 1,
  };
  if (width < 8 || height < 8) return base;

  // Generic scan: how many leading lines match `is`, from one side inward.
  const scan = (len: number, across: number, at: (i: number, j: number) => boolean) => {
    let n = 0;
    for (; n < len; n++) {
      let hits = 0;
      for (let j = 0; j < across; j++) if (at(n, j)) hits++;
      if (hits / across < cov) break;
    }
    return n;
  };
  const sides = (match: (x: number, y: number) => boolean) => ({
    top: scan(height, width, (i, j) => match(j, i)),
    bottom: scan(height, width, (i, j) => match(j, height - 1 - i)),
    left: scan(width, height, (i, j) => match(i, j)),
    right: scan(width, height, (i, j) => match(width - 1 - i, j)),
  });

  let b = sides(isTransparent);
  let kind: BorderKind | null = null;
  let flatColor: string | undefined;
  const significant = (v: { top: number; bottom: number; left: number; right: number }) =>
    Math.max(v.top, v.bottom) >= height * minShare || Math.max(v.left, v.right) >= width * minShare;

  if (significant(b)) kind = 'transparent';
  else if (opts.flat) {
    // Flat colour: compare every pixel with the colour in the image's own corner for that side.
    const near = (x: number, y: number, c: number[]) => Math.abs(data[px(x, y)] - c[0]) <= tol && Math.abs(data[px(x, y) + 1] - c[1]) <= tol && Math.abs(data[px(x, y) + 2] - c[2]) <= tol && data[px(x, y) + 3] > cutoff;
    const col = (x: number, y: number) => [data[px(x, y)], data[px(x, y) + 1], data[px(x, y) + 2]];
    const fb = {
      top: scan(height, width, (i, j) => near(j, i, col(width >> 1, 0))),
      bottom: scan(height, width, (i, j) => near(j, height - 1 - i, col(width >> 1, height - 1))),
      left: scan(width, height, (i, j) => near(i, j, col(0, height >> 1))),
      right: scan(width, height, (i, j) => near(width - 1 - i, j, col(width - 1, height >> 1))),
    };
    if (significant(fb)) { b = fb; kind = 'flat'; const c = col(width >> 1, 0); flatColor = hex(c[0], c[1], c[2]); }
  }

  if (!kind) return base;
  // Guard rails: never crop away most of the picture, never return an empty area.
  const cw = width - b.left - b.right, ch = height - b.top - b.bottom;
  if (cw < width * 0.2 || ch < height * 0.2 || cw < 8 || ch < 8) return base;
  const keep = (v: number, dim: number) => (v < dim * minShare ? 0 : v);
  const borders = { top: keep(b.top, height), bottom: keep(b.bottom, height), left: keep(b.left, width), right: keep(b.right, width) };
  const content = { x: borders.left, y: borders.top, w: width - borders.left - borders.right, h: height - borders.top - borders.bottom };
  return { ...base, borders, kind, content, contentAspect: content.w / content.h, ...(flatColor ? { flatColor } : {}) };
}

/** Scales a rect found on a downscaled analysis copy back to the source image, snapped to whole pixels. */
export function scaleRect(r: Rect, fromW: number, fromH: number, toW: number, toH: number): Rect {
  const sx = toW / fromW, sy = toH / fromH;
  const x = Math.max(0, Math.round(r.x * sx)), y = Math.max(0, Math.round(r.y * sy));
  return { x, y, w: Math.min(toW - x, Math.round(r.w * sx)), h: Math.min(toH - y, Math.round(r.h * sy)) };
}

export const isTrimWorthIt = (r: BorderReport) => r.kind !== null && (r.content.w < r.width || r.content.h < r.height);

/** Human verdict for the diagnostics screen. */
export function verdict(r: BorderReport): string {
  const bits: string[] = [];
  const { top, bottom, left, right } = r.borders;
  if (top || bottom) bits.push(`${top}px top, ${bottom}px bottom`);
  if (left || right) bits.push(`${left}px left, ${right}px right`);
  if (!r.kind) return r.width === r.height ? 'Clean square, nothing to trim' : `${r.width > r.height ? 'Landscape' : 'Portrait'} image, no borders (it is cropped to a square when shown)`;
  return `${r.kind === 'transparent' ? 'Transparent' : 'Flat ' + (r.flatColor ?? '')} border: ${bits.join(', ')}`;
}
