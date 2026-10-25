import { useRef, useState } from 'react';
import { formatTime } from '../lib/storage';

/** How far the finger is below or above the bar sets the scrub rate, like the iOS music player. */
export function scrubRate(distance: number): { rate: number; label: string } {
  if (distance < 50) return { rate: 1, label: '' };
  if (distance < 110) return { rate: 0.5, label: 'Half-speed scrubbing' };
  if (distance < 170) return { rate: 0.25, label: 'Quarter-speed scrubbing' };
  return { rate: 0.1, label: 'Fine scrubbing' };
}

/**
 * Progress bar. A touch jumps to that point; dragging then moves relative to the finger, slower the further the finger
 * slides away from the bar. Grows while held and shows the time over the handle. The range input underneath stays for
 * keyboard and VoiceOver, and is what tests read.
 */
export function SeekBar({ value, duration, onScrub, onCommit }: { value: number; duration: number; onScrub: (v: number) => void; onCommit: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const g = useRef({ on: false, lastX: 0, v: 0, id: -1 });
  const [held, setHeld] = useState<{ label: string } | null>(null);
  const dur = duration || 1;
  const pct = Math.min(100, (Math.min(value, dur) / dur) * 100);
  const clamp = (v: number) => Math.max(0, Math.min(dur, v));

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = wrap.current!.getBoundingClientRect();
    const v = clamp(((e.clientX - r.left) / r.width) * dur);
    g.current = { on: true, lastX: e.clientX, v, id: e.pointerId };
    try { wrap.current!.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
    setHeld({ label: '' });
    onScrub(v);
  };
  const move = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s.on || e.pointerId !== s.id) return;
    const r = wrap.current!.getBoundingClientRect();
    const { rate, label } = scrubRate(Math.abs(e.clientY - (r.top + r.height / 2)));
    s.v = clamp(s.v + ((e.clientX - s.lastX) / r.width) * dur * rate);
    s.lastX = e.clientX;
    if (label !== held?.label) setHeld({ label });
    onScrub(s.v);
  };
  const up = (e: React.PointerEvent) => {
    if (!g.current.on || e.pointerId !== g.current.id) return;
    g.current.on = false;
    setHeld(null);
    onCommit();
  };

  return (
    <div
      ref={wrap} className="seek-wrap relative" data-held={held ? '' : undefined} style={{ touchAction: 'none' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
    >
      {held && (
        <div className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 animate-pop whitespace-nowrap rounded-md bg-fg px-2 py-0.5 text-center text-caption font-semibold tabular-nums text-black shadow-float"
          style={{ left: `clamp(1.75rem, ${pct}%, calc(100% - 1.75rem))` }} aria-hidden="true" data-scrub-bubble>
          {formatTime(value)}
          {held.label && <div className="text-[0.625rem] font-medium opacity-70">{held.label}</div>}
        </div>
      )}
      <input
        type="range" className="seek pointer-events-none" min={0} max={dur} step={0.1} value={Math.min(value, dur)}
        style={{ ['--p' as string]: `${pct}%` }} aria-label="Seek" aria-valuetext={`${formatTime(value)} of ${formatTime(duration)}`}
        onChange={(e) => onScrub(Number(e.target.value))} onKeyUp={onCommit} onBlur={onCommit}
      />
    </div>
  );
}
