import type { Rect } from './artwork';

/**
 * Crop cover maths. The image is drawn in a square frame of side `view` px, scaled so its shorter side fills the frame
 * at zoom 1. `ox`/`oy` are where the image's top-left corner sits in the frame (0 or negative).
 */
export interface Pan { zoom: number; ox: number; oy: number }

export const MAX_ZOOM = 4;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const scaleOf = (w: number, h: number, view: number, zoom: number) => (view / Math.min(w, h)) * zoom;

/** Keeps the frame covered: the image can never be dragged so far that empty space shows. */
export function clampPan(w: number, h: number, view: number, p: Pan): Pan {
  const zoom = clamp(p.zoom, 1, MAX_ZOOM);
  const k = scaleOf(w, h, view, zoom);
  return { zoom, ox: clamp(p.ox, view - w * k, 0), oy: clamp(p.oy, view - h * k, 0) };
}

export function centred(w: number, h: number, view: number, zoom = 1): Pan {
  const k = scaleOf(w, h, view, zoom);
  return clampPan(w, h, view, { zoom, ox: (view - w * k) / 2, oy: (view - h * k) / 2 });
}

/** Zooms around a point of the frame (the pinch centre), keeping that point of the image under the fingers. */
export function zoomAround(w: number, h: number, view: number, p: Pan, zoom: number, cx = view / 2, cy = view / 2): Pan {
  const k0 = scaleOf(w, h, view, p.zoom), k1 = scaleOf(w, h, view, clamp(zoom, 1, MAX_ZOOM));
  const ix = (cx - p.ox) / k0, iy = (cy - p.oy) / k0;
  return clampPan(w, h, view, { zoom, ox: cx - ix * k1, oy: cy - iy * k1 });
}

/** The square of the source image that the frame shows, in whole source pixels. */
export function sourceSquare(w: number, h: number, view: number, p: Pan): Rect {
  const c = clampPan(w, h, view, p);
  const k = scaleOf(w, h, view, c.zoom);
  const s = Math.min(view / k, w, h);
  const side = Math.round(s);
  return { x: Math.round(clamp(-c.ox / k, 0, w - side)), y: Math.round(clamp(-c.oy / k, 0, h - side)), w: side, h: side };
}

/** The pan that shows a square saved earlier, so reopening Crop cover starts where the user left it. */
export function panFor(w: number, h: number, view: number, r: Rect): Pan {
  const zoom = Math.min(w, h) / Math.max(1, r.w);
  const k = scaleOf(w, h, view, zoom);
  return clampPan(w, h, view, { zoom, ox: -r.x * k, oy: -r.y * k });
}
