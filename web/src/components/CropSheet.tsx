import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { getOriginalArtBlob } from '../lib/artSource';
import { browserArtProcessor, cropTrack } from '../lib/artEdits';
import { centred, clampPan, MAX_ZOOM, panFor, scaleOf, sourceSquare, zoomAround, type Pan } from '../lib/crop';
import { haptic } from '../lib/haptics';
import { getPlayer } from '../lib/player';
import { ui, useUI } from '../lib/ui';
import { Sheet } from './Sheets';

/**
 * Crop cover: drag (and pinch, or use the slider) to choose the square that is shown everywhere, the lock screen
 * included. Works on the original image; the original stays and "Use original artwork" undoes it.
 */
export function CropSheet() {
  const { cropTrackId } = useUI();
  const track = useLiveQuery(() => (cropTrackId ? db.tracks.get(cropTrackId) : undefined), [cropTrackId]);
  const edit = useLiveQuery(() => (cropTrackId ? db.artEdits.get(cropTrackId) : undefined), [cropTrackId]);
  const [src, setSrc] = useState<{ url: string; w: number; h: number } | null>(null);
  const [pan, setPan] = useState<Pan | null>(null);
  const [saving, setSaving] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(280);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    setSrc(null); setPan(null);
    if (!cropTrackId) return;
    let url = '', live = true;
    void getOriginalArtBlob(cropTrackId).then((b) => {
      if (!b || !live) return;
      url = URL.createObjectURL(b);
      const img = new Image();
      img.onload = () => { if (live) setSrc({ url, w: img.naturalWidth, h: img.naturalHeight }); };
      img.src = url;
    });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [cropTrackId]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [src]);

  // Start where the last manual crop left off, otherwise on the centred square the app already shows.
  useEffect(() => {
    if (!src || pan) return;
    const r = edit?.kind === 'manual' && !edit.disabled ? edit.rect : undefined;
    setPan(r ? panFor(src.w, src.h, view, r) : centred(src.w, src.h, view));
  }, [src, edit, view, pan]);

  if (!cropTrackId || !track) return null;
  const close = ui.closeCrop;
  const p = src && pan ? clampPan(src.w, src.h, view, pan) : null;
  const k = src && p ? scaleOf(src.w, src.h, view, p.zoom) : 1;

  const local = (e: React.PointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, local(e));
    try { frame.current!.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
    if (pointers.current.size === 2 && p) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: p.zoom };
    }
  };
  const move = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !src || !p) return;
    const cur = local(e);
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setPan(zoomAround(src.w, src.h, view, p, gesture.current.zoom * (dist / Math.max(gesture.current.dist, 1)), (a.x + b.x) / 2, (a.y + b.y) / 2));
    } else if (pointers.current.size === 1) {
      setPan(clampPan(src.w, src.h, view, { ...p, ox: p.ox + cur.x - prev.x, oy: p.oy + cur.y - prev.y }));
    }
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  };

  const save = async () => {
    if (!src || !p || !browserArtProcessor) return;
    setSaving(true);
    const ok = await cropTrack(cropTrackId, browserArtProcessor, sourceSquare(src.w, src.h, view, p));
    setSaving(false);
    haptic();
    getPlayer().refreshArtwork(cropTrackId);
    ui.toast(ok ? 'Cover cropped (original kept)' : 'Could not crop this cover');
    if (ok) close();
  };

  return (
    <Sheet title="Crop cover" onClose={close} z="z-[70]">
      <p className="mb-3 text-footnote text-fg-2">Drag to choose what stays. Pinch or use the slider to zoom. This square is used everywhere, the lock screen too.</p>
      <div
        ref={frame} className="relative mx-auto aspect-square w-full max-w-[20rem] touch-none select-none overflow-hidden rounded-xl bg-s3"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-crop-frame
      >
        {src && p && (
          <img src={src.url} alt="" draggable={false} className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
            style={{ width: src.w, height: src.h, transform: `translate(${p.ox}px, ${p.oy}px) scale(${k})` }} />
        )}
        {/* thirds grid, as in the Photos crop tool */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => <span key={i} className="border-[0.5px] border-white/15" />)}
        </div>
      </div>
      <label className="mx-auto mt-4 flex max-w-[20rem] items-center gap-3 text-footnote text-fg-2">
        Zoom
        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={p?.zoom ?? 1} aria-label="Zoom" className="min-w-0 flex-1 accent-white"
          onChange={(e) => src && p && setPan(zoomAround(src.w, src.h, view, p, Number(e.target.value)))} />
      </label>
      <div className="mx-auto mt-4 flex max-w-[20rem] gap-2">
        <button className="press h-11 flex-1 rounded-full bg-s3 font-semibold" onClick={() => src && setPan(centred(src.w, src.h, view))}>Reset</button>
        <button className="press h-11 flex-1 rounded-full bg-fg font-semibold text-black disabled:opacity-40" disabled={!p || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </Sheet>
  );
}
