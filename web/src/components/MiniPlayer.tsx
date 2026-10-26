import { useRef } from 'react';
import { haptic } from '../lib/haptics';
import { getPlayer, usePlayer, usePlaybackTime } from '../lib/player';
import { prefersReducedMotion, ui, useUI } from '../lib/ui';
import { Art } from './Art';
import { NextIcon, PauseIcon, PlayIcon } from './Icons';

const SKIP_DISTANCE = 70;
const OPEN_DISTANCE = 40;

export function MiniPlayer() {
  const s = usePlayer();
  const { playerOpen, toast } = useUI();
  const { currentTime, duration } = usePlaybackTime();
  const p = getPlayer();
  const card = useRef<HTMLDivElement>(null);
  // Swipe left/right to skip, drag up to open. Imperative so a drag never re-renders React.
  const drag = useRef({ x0: 0, y0: 0, dx: 0, dy: 0, axis: '' as '' | 'x' | 'y', moved: false });
  if (!s.track) return null;
  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  const t = s.track;

  const settle = (el: HTMLElement, transform = '') => {
    el.style.transition = prefersReducedMotion() ? 'none' : 'transform .28s var(--ease-out), opacity .28s var(--ease-out)';
    el.style.transform = transform;
    el.style.opacity = '';
  };
  const onStart = (e: React.TouchEvent) => {
    drag.current = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, dx: 0, dy: 0, axis: '', moved: false };
  };
  const onMove = (e: React.TouchEvent) => {
    const d = drag.current, el = card.current;
    if (!el) return;
    d.dx = e.touches[0].clientX - d.x0;
    d.dy = e.touches[0].clientY - d.y0;
    if (!d.axis && Math.hypot(d.dx, d.dy) > 8) d.axis = Math.abs(d.dx) > Math.abs(d.dy) ? 'x' : 'y';
    if (!d.axis) return;
    d.moved = true;
    el.style.transition = 'none';
    if (d.axis === 'x') {
      el.style.transform = `translateX(${d.dx * 0.6}px)`;
      el.style.opacity = String(1 - Math.min(Math.abs(d.dx) / 400, 0.4));
    } else {
      el.style.transform = `translateY(${Math.min(0, d.dy) * 0.5}px)`;
    }
  };
  const onEnd = () => {
    const d = drag.current, el = card.current;
    if (!el || !d.moved) return;
    window.setTimeout(() => { d.moved = false; }, 350); // only the click right after this gesture is swallowed
    if (d.axis === 'x' && Math.abs(d.dx) > SKIP_DISTANCE) {
      haptic();
      void (d.dx < 0 ? p.next() : p.previous());
    } else if (d.axis === 'y' && d.dy < -OPEN_DISTANCE) {
      haptic();
      ui.openPlayer('now');
    }
    settle(el);
  };
  // A drag must not also count as a tap on the buttons underneath.
  const swallowClickAfterDrag = (e: React.MouseEvent) => { if (drag.current.moved) { e.preventDefault(); e.stopPropagation(); drag.current.moved = false; } };

  return (
    <div className="px-3 pb-1.5">
      <div
        ref={card}
        className="glass relative mx-auto max-w-md overflow-hidden rounded-2xl"
        style={{ backgroundImage: 'linear-gradient(100deg, rgb(var(--art-rgb) / .2), transparent 75%)', touchAction: 'none' }}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd} onClickCapture={swallowClickAfterDrag}
        data-miniplayer
      >
        <div className="flex items-center py-1 pl-1.5 pr-0.5">
          <button className="press flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => ui.openPlayer('now')} aria-label={`Open player. Now playing ${t.title}`}>
            <Art trackId={t.hasArt ? t.id : undefined} seed={`${t.album}|${t.artist}`} className="h-9 w-9" rounded="rounded-md" vtName={playerOpen ? undefined : 'cadence-art'} priority />
            <div className="min-w-0 flex-1">
              <div className="truncate text-footnote font-semibold leading-tight">{t.title}</div>
              <div className="truncate text-caption text-fg-2">{s.error ?? (s.interrupted ? 'Paused · interrupted' : t.artist)}</div>
            </div>
          </button>
          <button className="press tap rounded-full" onClick={() => { haptic(); void p.toggle(); }} aria-label={s.isPlaying ? 'Pause' : 'Play'}>
            {s.isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          <button className="press tap rounded-full text-fg-2" onClick={() => void p.next()} aria-label="Next track">
            <NextIcon size={20} />
          </button>
        </div>
        <div className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full rounded-full bg-fg" style={{ width: `${pct}%` }} />
        </div>
        {/* Toasts show inside the mini-player so they never cover page content. */}
        {toast && !playerOpen && (
          <div key={toast.id} className={`absolute inset-0 flex animate-fade items-center gap-3 bg-s2 px-4 ${toast.action ? '' : 'pointer-events-none'}`} role="status" aria-live="polite" data-toast>
            <span className="min-w-0 flex-1 truncate text-footnote font-semibold">{toast.text}</span>
            {toast.action && (
              <button className="press h-8 shrink-0 rounded-full bg-fg px-3 text-footnote font-semibold text-black" onClick={() => { toast.action!.run(); ui.dismissToast(); }}>{toast.action.label}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
