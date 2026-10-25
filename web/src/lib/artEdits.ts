import { db as defaultDb, getSetting, setSetting, type CadenceDB } from './db';
import { invalidateArt } from './art';
import { detectBorders, isTrimWorthIt, scaleRect, verdict, type BorderReport, type Rect } from './artwork';
import { getOriginalArtBlob } from './artSource';

/** Image work that needs a browser (decode + canvas). Injected so the logic is testable in Node. */
export interface ArtProcessor {
  /** Decodes to RGBA, downscaled so the longest side is at most `maxSide`. Also returns the true source size. */
  decode(blob: Blob, maxSide: number): Promise<{ data: ArrayLike<number>; width: number; height: number; srcWidth: number; srcHeight: number } | null>;
  crop(blob: Blob, rect: Rect): Promise<Blob>;
}

export const AUTO_TRIM_KEY = 'autoTrimArtwork';
const ANALYSIS_SIDE = 480;

export interface ArtAnalysis {
  trackId: string;
  mime: string;
  bytes: number;
  report: BorderReport;
  /** Border report scaled to the real image size. */
  rect: Rect;
  verdict: string;
  trimWorthIt: boolean;
}

export async function analyzeBlob(blob: Blob, proc: ArtProcessor, flat: boolean): Promise<Omit<ArtAnalysis, 'trackId'> | null> {
  const img = await proc.decode(blob, ANALYSIS_SIDE);
  if (!img) return null;
  const small = detectBorders(img.data, img.width, img.height, { flat });
  // Report in real pixels, not analysis pixels.
  const rect = scaleRect(small.content, img.width, img.height, img.srcWidth, img.srcHeight);
  const sx = img.srcWidth / img.width, sy = img.srcHeight / img.height;
  const report: BorderReport = {
    ...small, width: img.srcWidth, height: img.srcHeight, content: rect, contentAspect: rect.w / rect.h,
    borders: { top: Math.round(small.borders.top * sy), bottom: Math.round(small.borders.bottom * sy), left: Math.round(small.borders.left * sx), right: Math.round(small.borders.right * sx) },
  };
  return { mime: blob.type, bytes: blob.size, report, rect, verdict: verdict(report), trimWorthIt: isTrimWorthIt(report) };
}

export async function analyzeTrack(trackId: string, proc: ArtProcessor, opts: { flat?: boolean; db?: CadenceDB } = {}): Promise<ArtAnalysis | null> {
  const d = opts.db ?? defaultDb;
  const blob = await getOriginalArtBlob(trackId, d);
  if (!blob) return null;
  const a = await analyzeBlob(blob, proc, !!opts.flat);
  return a ? { trackId, ...a } : null;
}

export type TrimResult = 'trimmed' | 'clean' | 'no-art' | 'failed';

/**
 * Trims borders into a separate copy. The embedded original is never modified, so this is always undoable.
 * `flat` also trims flat-colour borders (manual use); the automatic path only trims transparent ones.
 */
export async function trimTrack(trackId: string, proc: ArtProcessor, opts: { flat?: boolean; db?: CadenceDB } = {}): Promise<TrimResult> {
  const d = opts.db ?? defaultDb;
  try {
    const original = await getOriginalArtBlob(trackId, d);
    if (!original) return 'no-art';
    const a = await analyzeBlob(original, proc, !!opts.flat);
    if (!a) return 'failed';
    if (!a.trimWorthIt || !a.report.kind) {
      await d.artEdits.put({ trackId, kind: 'clean', createdAt: Date.now() });
      await invalidateArt(trackId);
      return 'clean';
    }
    const blob = await proc.crop(original, a.rect);
    await d.artEdits.put({ trackId, kind: a.report.kind, blob, rect: a.rect, from: { w: a.report.width, h: a.report.height }, to: { w: a.rect.w, h: a.rect.h }, createdAt: Date.now() });
    await invalidateArt(trackId);
    return 'trimmed';
  } catch {
    return 'failed';
  }
}

/** "Use original": keeps a marker so automatic trimming does not redo it. */
export async function useOriginal(trackId: string, d: CadenceDB = defaultDb): Promise<void> {
  const cur = await d.artEdits.get(trackId);
  await d.artEdits.put({ ...(cur ?? { kind: 'clean' as const }), trackId, disabled: true, createdAt: Date.now() });
  await invalidateArt(trackId);
}

/** Undoes every trim and stops automatic trimming. Original images are untouched, so nothing is lost. */
export async function undoAll(d: CadenceDB = defaultDb): Promise<number> {
  const edits = (await d.artEdits.toArray()).filter((e) => e.blob);
  await d.artEdits.clear();
  await setSetting(AUTO_TRIM_KEY, false, d);
  for (const e of edits) await invalidateArt(e.trackId);
  return edits.length;
}

export async function isAutoTrimOn(d: CadenceDB = defaultDb): Promise<boolean> {
  return getSetting<boolean>(AUTO_TRIM_KEY, true, d);
}

/** After an import: trims transparent borders of one new cover, if automatic trimming is on. */
export async function autoTrimNew(trackId: string, proc: ArtProcessor | null, d: CadenceDB = defaultDb): Promise<TrimResult | 'off'> {
  if (!proc || !(await isAutoTrimOn(d))) return 'off';
  if (await d.artEdits.get(trackId)) return 'clean';
  return trimTrack(trackId, proc, { db: d });
}

/** Background pass over existing tracks that were never scanned. Transparent borders only. */
export async function autoTrimAll(proc: ArtProcessor | null, opts: { db?: CadenceDB; limit?: number; onChange?: () => void } = {}): Promise<number> {
  const d = opts.db ?? defaultDb;
  if (!proc || !(await isAutoTrimOn(d))) return 0;
  const withArt = (await d.tracks.filter((t) => t.hasArt).primaryKeys()) as string[];
  const done = new Set((await d.artEdits.toCollection().primaryKeys()) as string[]);
  let n = 0;
  for (const id of withArt.filter((id) => !done.has(id)).slice(0, opts.limit ?? 100)) {
    if ((await trimTrack(id, proc, { db: d })) === 'trimmed') { n++; opts.onChange?.(); }
    await new Promise((r) => setTimeout(r, 0));
  }
  return n;
}

// ---- browser implementation ----

export const browserArtProcessor: ArtProcessor | null =
  typeof createImageBitmap === 'function' && typeof document !== 'undefined'
    ? {
        async decode(blob, maxSide) {
          try {
            const bmp = await createImageBitmap(blob);
            const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
            const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            if (!ctx) return null;
            ctx.clearRect(0, 0, w, h); // keep transparency as transparency
            ctx.drawImage(bmp, 0, 0, w, h);
            const out = { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h, srcWidth: bmp.width, srcHeight: bmp.height };
            bmp.close?.();
            return out;
          } catch { return null; }
        },
        async crop(blob, r) {
          const bmp = await createImageBitmap(blob);
          const c = document.createElement('canvas');
          c.width = r.w; c.height = r.h;
          const ctx = c.getContext('2d');
          if (!ctx) throw new Error('No canvas');
          ctx.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
          bmp.close?.();
          const png = /png|webp|gif/i.test(blob.type);
          return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), png ? 'image/png' : 'image/jpeg', 0.92));
        },
      }
    : null;
