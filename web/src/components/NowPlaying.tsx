import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Q from '../lib/queue';
import { db } from '../lib/db';
import { toggleFavorite } from '../lib/library';
import { removeLyrics } from '../lib/lyrics';
import { clampOffset, displayLyrics, linesToSync } from '../lib/lrc';
import { useArtThumb, useGlobalAccent } from '../lib/accent';
import { getPlayer, usePlayer, usePlaybackTime } from '../lib/player';
import { haptic } from '../lib/haptics';
import { useTracks } from '../lib/hooks';
import { similarTo } from '../lib/similar';
import { displayTrack } from '../lib/names';
import { rgbCss, type Palette } from '../lib/palette';
import { formatRemaining, formatTime } from '../lib/storage';
import { supportsViewTransitions, ui, useUI } from '../lib/ui';
import type { Track } from '../lib/types';
import { Art } from './Art';
import { LyricsView, PasteLyricsSheet, SyncLyricsSheet, useLyricFilePicker } from './LyricsView';
import { SeekBar } from './SeekBar';
import { Marquee } from './Marquee';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetItem } from './Sheets';
import { ToastBubble } from './Toast';
import {
  ChevronDown, CloseIcon, GripIcon, HeartIcon, MoonIcon, MoreIcon, NextIcon, PauseIcon, PlayIcon, PlusIcon, PrevIcon, QueueIcon,
  QuoteIcon, RepeatIcon, RepeatOneIcon, ShuffleIcon, TimingIcon, TrashIcon,
} from './Icons';

const DISMISS_DISTANCE = 130;
const DISMISS_VELOCITY = 0.55; // px per ms

type Touchy = { onStart: (e: React.TouchEvent) => void; onMove: (e: React.TouchEvent) => void; onEnd: () => void };

/**
 * Charcoal with soft colour shapes from the cover that drift slowly (transform-only, paused while the player is closed
 * and with Reduce Motion). The lyrics view adds a soft blurred cover. Cross-fades between tracks.
 */
function Backdrop({ palette, trackId, blur, live }: { palette: Palette; trackId?: string; blur: boolean; live: boolean }) {
  const thumb = useArtThumb(blur ? trackId : undefined);
  const [layers, setLayers] = useState([{ id: 0, palette, thumb }]);
  const last = useRef(palette);
  useEffect(() => {
    if (last.current === palette && layers[layers.length - 1].thumb === thumb) return;
    last.current = palette;
    setLayers((l) => [...l.slice(-1), { id: l[l.length - 1].id + 1, palette, thumb }]);
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, thumb]);
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden bg-bg ${live ? '' : 'ambient-paused'}`} aria-hidden="true" data-ambient>
      {layers.map((l, i) => (
        <div key={l.id} className={`absolute inset-0 ${i > 0 ? 'animate-fade' : ''}`} style={{ animationDuration: '700ms' }}>
          <span className="ambient-blob ambient-a" style={{ background: `radial-gradient(closest-side, rgb(${rgbCss(l.palette.accent)} / .55), transparent)` }} />
          <span className="ambient-blob ambient-b" style={{ background: `radial-gradient(closest-side, rgb(${rgbCss(l.palette.accent2)} / .45), transparent)` }} />
          <span className="ambient-blob ambient-c" style={{ background: `radial-gradient(closest-side, rgb(${rgbCss(l.palette.accentText)} / .22), transparent)` }} />
          {l.thumb && <img src={l.thumb} alt="" className="absolute inset-0 h-full w-full scale-[1.8] object-cover opacity-40 blur-2xl saturate-125" />}
          <div className="absolute inset-0" style={{ background: `radial-gradient(130% 60% at 50% -8%, rgb(${rgbCss(l.palette.accent)} / ${blur ? 0.3 : 0.22}), transparent 72%), linear-gradient(to bottom, transparent 40%, rgb(16 18 20 / ${blur ? 0.7 : 0.9}) 100%)` }} />
        </div>
      ))}
    </div>
  );
}

export function NowPlaying() {
  const { playerOpen, playerTab } = useUI();
  const s = usePlayer();
  const t = s.track;
  const open = playerOpen && !!t;
  const palette = useGlobalAccent(t);
  const root = useRef<HTMLDivElement>(null);
  const vt = supportsViewTransitions();

  // Swipe-down to dismiss. Handled imperatively so dragging never re-renders React.
  const drag = useRef({ y0: 0, t0: 0, dy: 0, on: false });
  const touch: Touchy = {
    onStart: (e) => { drag.current = { y0: e.touches[0].clientY, t0: performance.now(), dy: 0, on: true }; },
    onMove: (e) => {
      const d = drag.current;
      if (!d.on || !root.current) return;
      d.dy = Math.max(0, e.touches[0].clientY - d.y0);
      root.current.style.transition = 'none';
      root.current.style.transform = `translateY(${d.dy}px) scale(${1 - Math.min(d.dy / 600, 0.06)})`;
      root.current.style.borderRadius = `${Math.min(d.dy / 4, 32)}px`;
    },
    onEnd: () => {
      const d = drag.current, el = root.current;
      if (!d.on || !el) return;
      d.on = false;
      const v = d.dy / Math.max(performance.now() - d.t0, 1);
      const dismiss = d.dy > DISMISS_DISTANCE || (v > DISMISS_VELOCITY && d.dy > 30);
      el.style.transition = 'transform .32s cubic-bezier(.2,.8,.2,1), border-radius .32s';
      if (dismiss) {
        haptic();
        el.style.transform = 'translateY(105%)';
        window.setTimeout(() => ui.closePlayer(false), 300);
      } else {
        el.style.transform = 'translateY(0) scale(1)';
        el.style.borderRadius = '0px';
      }
    },
  };
  useEffect(() => {
    if (open && root.current) { const el = root.current; el.style.transition = ''; el.style.transform = ''; el.style.borderRadius = ''; }
  }, [open]);

  return (
    <div
      ref={root}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg"
      aria-hidden={!open}
      // @ts-expect-error inert is valid HTML but missing from React's types in this version
      inert={!open ? '' : undefined}
      style={{
        transform: open ? undefined : 'translateY(100%)',
        visibility: open ? 'visible' : 'hidden',
        transition: vt ? 'none' : `transform var(--dur-slow) var(--ease-out), visibility 0s linear ${open ? '0s' : 'var(--dur-slow)'}`,
        viewTransitionName: open ? 'cadence-sheet' : undefined,
        willChange: 'transform',
      } as React.CSSProperties}
    >
      <Backdrop palette={palette} trackId={t?.hasArt ? t.id : undefined} blur={playerTab === 'lyrics'} live={open} />
      {open && <ToastBubble className="absolute inset-x-0 z-10 px-4" style={{ top: 'calc(var(--sat) + 3.75rem)' }} />}
      {t && (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {playerTab === 'now' && <NowTab track={t} touch={touch} />}
          {playerTab === 'queue' && <QueueTab track={t} touch={touch} />}
          {playerTab === 'lyrics' && <LyricsTab track={t} touch={touch} />}
        </div>
      )}
    </div>
  );
}

/** Compact header: collapse button, track context, and a spacer (or action) to keep the title centred. */
function Header({ eyebrow, title, touch, left, right, onTitle }: { eyebrow: string; title: string; touch: Touchy; left?: React.ReactNode; right?: React.ReactNode; onTitle?: () => void }) {
  return (
    <header className="relative shrink-0 px-gutter pb-2" style={{ paddingTop: 'calc(var(--sat) + 0.5rem)', touchAction: 'none' }} onTouchStart={touch.onStart} onTouchMove={touch.onMove} onTouchEnd={touch.onEnd} onTouchCancel={touch.onEnd}>
      <div className="flex items-center justify-between gap-2">
        {left ?? <CircleButton label="Close player" onClick={() => { haptic(); ui.closePlayer(); }}><ChevronDown size={22} /></CircleButton>}
        <div className="min-w-0 flex-1 text-center">
          <div className="eyebrow truncate">{eyebrow}</div>
          {onTitle
            ? <button className="press max-w-full truncate text-footnote font-semibold" onClick={onTitle} aria-label={`Go to ${title}`}>{title}</button>
            : <div className="truncate text-footnote font-semibold">{title}</div>}
        </div>
        {right ?? <span className="h-9 w-9 shrink-0" aria-hidden="true" />}
      </div>
    </header>
  );
}

function CircleButton({ label, onClick, children, pressed, size = 'sm' }: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean; size?: 'sm' | 'md' }) {
  return (
    <button className={`press flex shrink-0 items-center justify-center rounded-full bg-white/[0.08] ${size === 'md' ? 'h-11 w-11' : 'h-9 w-9'}`} onClick={onClick} aria-label={label} aria-pressed={pressed}>{children}</button>
  );
}

function NowTab({ track, touch }: { track: Track; touch: Touchy }) {
  const s = usePlayer();
  const fav = useLiveQuery(() => db.tracks.get(track.id).then((t) => t?.favorite === 1), [track.id]);
  const { playerOpen } = useUI();
  const nav = useNavigate();
  const go = (to: string) => { ui.closePlayer(); nav(to); };
  const toArtist = track.artist !== 'Unknown Artist' ? () => go(`/library/artists/${encodeURIComponent(track.artist)}`) : undefined;
  const toAlbum = track.album !== 'Unknown Album' ? () => go(`/library/albums/${encodeURIComponent(`${track.album}\u0000${track.artist}`)}`) : toArtist;
  return (
    <>
      <Header eyebrow="Playing from" title={track.album === 'Unknown Album' ? track.artist : track.album} touch={touch} onTitle={toAlbum} />
      {/* Cover + title are one group, centred in the free space. The cover is capped (20rem, 42% of the height) so tall phones don't get a giant cover. */}
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-gutter" style={{ touchAction: 'none', ['--cw' as string]: 'min(100%, 20rem)' }} onTouchStart={touch.onStart} onTouchMove={touch.onMove} onTouchEnd={touch.onEnd} onTouchCancel={touch.onEnd}>
        {/* my-auto centres the group when there is room and lets it scroll (instead of overlapping the controls) when text is very large. */}
        <div className="my-auto flex w-full flex-col items-center gap-4 py-2">
        {/* Resuming springs back with a small overshoot; pausing settles without one. Durations follow the motion tokens, so reduced motion turns this off. */}
        <div className="w-[min(var(--cw),42dvh,max(7.5rem,calc(100dvh-22rem-var(--sat)-var(--sab))))] rounded-xl" style={{
          // A glow in the cover's own colour under the cover, softer while paused.
          boxShadow: s.isPlaying ? '0 28px 70px -22px rgb(var(--art-rgb) / .7), 0 12px 30px -14px rgb(0 0 0 / .55)' : '0 16px 40px -20px rgb(var(--art-rgb) / .45), 0 8px 20px -12px rgb(0 0 0 / .5)',
          transform: s.isPlaying ? 'scale(1)' : 'scale(.92)',
          transition: s.isPlaying ? 'transform calc(var(--dur-slow) * 1.35) cubic-bezier(.28, 1.7, .42, 1), box-shadow var(--dur-slow) var(--ease-out)' : 'transform var(--dur-slow) var(--ease-out), box-shadow var(--dur-slow) var(--ease-out)',
        }} data-cover>
          <Art trackId={track.hasArt ? track.id : undefined} seed={`${track.album}|${track.artist}`} className="w-full" rounded="rounded-xl" vtName={playerOpen ? 'cadence-art' : undefined} shadow priority />
        </div>
        <div className="flex w-[var(--cw)] items-center gap-2" style={{ touchAction: 'auto' }}>
          <div className="min-w-0 flex-1">
            <h2 className="text-title font-bold leading-tight"><Marquee key={track.id} text={track.title} /></h2>
            {toArtist
              ? <button className="press block max-w-full truncate text-left text-body text-fg-2" onClick={toArtist} aria-label={`Go to ${track.artist}`}>{track.artist}</button>
              : <div className="truncate text-body text-fg-2">{track.artist}</div>}
            {track.license && <div className="truncate text-caption text-fg-3">{track.license.name} · {track.license.attribution}</div>}
          </div>
          <CircleButton label={fav ? 'Remove from favorites' : 'Add to favorites'} pressed={!!fav} onClick={() => { haptic(); void toggleFavorite(track.id); }}><HeartIcon size={18} filled={!!fav} /></CircleButton>
          <CircleButton label="More actions" onClick={() => ui.openTrackSheet(track.id)}><MoreIcon size={18} /></CircleButton>
        </div>
        </div>
      </div>
      <Transport />
    </>
  );
}

function QueueTab({ track, touch }: { track: Track; touch: Touchy }) {
  const s = usePlayer();
  const p = getPlayer();
  const tracks = useLiveQuery(() => db.tracks.bulkGet(s.queue.items).then((l) => l.map((t) => displayTrack(t))), [s.queue.items]);
  const library = useTracks();
  const { items, index, repeat } = s.queue;
  const [showHistory, setShowHistory] = useState(false);
  const [drag, setDrag] = useState<{ from: number; dy: number; h: number } | null>(null);
  const after = Q.afterCurrent(s.queue);
  const nextCount = Q.upcoming(s.queue).length;
  const byIndex = (i: number) => tracks?.[i] ?? null;
  const title = (i: number) => byIndex(i)?.title ?? 'this song';
  // Same album, artist, genre, then mood: offered only when the queue is about to stop and something real matches.
  const similar = useMemo(() => (after.kind === 'stop' && library ? similarTo(track, library, items) : []), [after.kind, library, track, items]);

  const target = drag ? Math.min(items.length - 1, Math.max(index + 1, drag.from + Math.round(drag.dy / drag.h))) : -1;
  const shiftFor = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < target && i > drag.from && i <= target) return -drag.h;
    if (drag.from > target && i >= target && i < drag.from) return drag.h;
    return 0;
  };
  const removeWithUndo = (i: number) => {
    const id = items[i];
    const originalAt = s.queue.original.indexOf(id);
    const name = title(i);
    haptic();
    void p.removeFromQueue(i);
    ui.toast(`Removed “${name}”`, { label: 'Undo', run: () => p.insertInQueue(i, id, originalAt) });
  };

  const row = (i: number, opts: { controls: boolean; dim?: boolean }) => {
    const t = byIndex(i);
    if (!t) return null;
    const dragging = drag?.from === i;
    const shift = dragging ? drag.dy : shiftFor(i);
    return (
      <QueueRow
        key={`${items[i]}:${i}`} track={t} dim={opts.dim} controls={opts.controls} dragging={dragging}
        style={{ transform: shift ? `translateY(${shift}px)` : undefined, transition: drag && !dragging ? 'transform var(--dur) var(--ease-out)' : 'none', zIndex: dragging ? 2 : undefined }}
        onPlay={() => void p.playIndex(i)}
        onRemove={() => removeWithUndo(i)}
        onDragStart={(h) => { haptic(); setDrag({ from: i, dy: 0, h }); }}
        onDragMove={(dy) => setDrag((d) => (d ? { ...d, dy } : d))}
        onDragEnd={() => { if (target >= 0 && target !== i) p.moveInQueue(i, target); setDrag(null); }}
        onStep={(dir) => { const to = i + dir; if (to > index && to < items.length) p.moveInQueue(i, to); }}
      />
    );
  };
  return (
    <>
      <Header eyebrow="Queue" title={`${items.length} song${items.length === 1 ? '' : 's'}${s.queue.shuffle ? ' · shuffled' : ''}`} touch={touch} />
      <div className="flex min-h-0 flex-1 animate-fade flex-col">
        {/* The song that is playing is its own section. It is never listed under "Up next". */}
        <section aria-label="Now playing" className="mx-gutter flex items-center gap-3 rounded-xl bg-white/[0.07] p-2.5">
          <Art trackId={track.hasArt ? track.id : undefined} seed={`${track.album}|${track.artist}`} className="h-12 w-12" rounded="rounded-lg" shadow />
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Now playing</div>
            <div className="truncate text-body font-semibold">{track.title}</div>
            <div className="truncate text-footnote text-fg-2">{track.artist}</div>
          </div>
        </section>

        <div className="flex items-center justify-between px-gutter pb-1 pt-4">
          <h3 className="eyebrow">Up next{nextCount ? ` · ${nextCount}` : ''}</h3>
          {nextCount > 0 && <button className="press text-footnote font-semibold" onClick={() => p.clearUpcoming()}>Clear</button>}
        </div>
        <div className="scroll-y hide-scroll relative min-h-0 flex-1" style={{ overflowY: drag ? 'hidden' : undefined, maskImage: 'linear-gradient(to bottom, transparent, #000 0.5rem, #000 calc(100% - 0.75rem), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 0.5rem, #000 calc(100% - 0.75rem), transparent)' }}>
          {after.kind === 'repeat-one' && <p className="px-gutter py-2 text-footnote text-fg-2">Repeating “{track.title}”. Turn repeat off to continue to the next song.</p>}
          {nextCount === 0 && after.kind !== 'repeat-one' && (
            <p className="px-gutter py-2 text-footnote text-fg-2">
              {after.kind === 'wrap'
                ? after.same ? `Repeat is on: “${track.title}” will play again.` : `Nothing else is queued. Repeat is on, so playback returns to “${title(0)}”.`
                : 'Nothing queued after this song. Add songs from the ••• menu.'}
            </p>
          )}
          {similar.length > 0 && (
            <div className="px-gutter pb-2 pt-1">
              <button className="press flex h-10 items-center gap-2 rounded-full bg-white/[0.09] px-4 text-footnote font-semibold"
                onClick={() => { p.enqueue(similar.map((x) => x.id)); ui.toast(`Added ${similar.length} similar song${similar.length === 1 ? '' : 's'}`); }}>
                <PlusIcon size={16} /> Keep playing similar
              </button>
              <p className="mt-1.5 text-caption text-fg-3">From the same album, artist or genre in your library.</p>
            </div>
          )}
          {Q.upcoming(s.queue).map((_, k) => row(index + 1 + k, { controls: true }))}
          {repeat === 'all' && nextCount > 0 && <p className="px-gutter py-2 text-caption text-fg-3">Then repeats from “{title(0)}”.</p>}

          {Q.history(s.queue).length > 0 && (
            <>
              <button className="press px-gutter pb-1 pt-4 text-left text-footnote font-semibold text-fg-2" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
                {showHistory ? 'Hide' : 'Show'} previously played ({Q.history(s.queue).length})
              </button>
              {showHistory && Q.history(s.queue).map((_, i) => row(i, { controls: false, dim: true }))}
            </>
          )}
          <div className="h-2" />
        </div>
      </div>
      <Transport />
    </>
  );
}

const SWIPE_REMOVE = 0.35; // of the row width

/** One queue entry. Upcoming entries drag by the handle to reorder and swipe left to remove. */
function QueueRow({ track: t, dim, controls, dragging, style, onPlay, onRemove, onDragStart, onDragMove, onDragEnd, onStep }: {
  track: Track; dim?: boolean; controls: boolean; dragging: boolean; style: React.CSSProperties;
  onPlay: () => void; onRemove: () => void; onDragStart: (rowHeight: number) => void; onDragMove: (dy: number) => void; onDragEnd: () => void; onStep: (dir: -1 | 1) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const handle = useRef({ y0: 0, id: -1 });
  const swipe = useRef({ x0: 0, y0: 0, dx: 0, axis: '' as '' | 'x' | 'y' });

  const onTouchStart = (e: React.TouchEvent) => { swipe.current = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, dx: 0, axis: '' }; };
  const onTouchMove = (e: React.TouchEvent) => {
    const sw = swipe.current, c = content.current;
    if (!controls || !c) return;
    const dx = e.touches[0].clientX - sw.x0, dy = e.touches[0].clientY - sw.y0;
    if (!sw.axis && Math.hypot(dx, dy) > 8) sw.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (sw.axis !== 'x') return;
    sw.dx = Math.min(0, dx);
    c.style.transition = 'none';
    c.style.transform = `translateX(${sw.dx}px)`;
  };
  const onTouchEnd = () => {
    const sw = swipe.current, c = content.current;
    if (!c || sw.axis !== 'x') return;
    window.setTimeout(() => { sw.axis = ''; }, 350); // only the click right after this swipe is swallowed
    const gone = -sw.dx > c.offsetWidth * SWIPE_REMOVE;
    c.style.transition = 'transform .24s var(--ease-out)';
    c.style.transform = gone ? 'translateX(-100%)' : '';
    if (gone) window.setTimeout(onRemove, 200);
  };

  return (
    <div ref={el} className={`relative ${dim ? 'opacity-55' : ''}`} style={style} data-queue-row>
      {controls && <div className="absolute inset-0 flex items-center justify-end bg-red-500/80 pr-gutter text-footnote font-semibold" aria-hidden="true">Remove</div>}
      <div
        ref={content}
        className={`relative flex items-center gap-1 pl-gutter pr-1 ${controls ? 'bg-bg' : ''} ${dragging ? 'rounded-lg bg-s2 shadow-float' : ''}`}
        style={{ touchAction: 'pan-y' }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        onClickCapture={(e) => { if (swipe.current.axis === 'x') { e.preventDefault(); e.stopPropagation(); swipe.current.axis = ''; } }}
      >
        <button className="press flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left" onClick={onPlay}>
          <Art trackId={t.hasArt ? t.id : undefined} seed={`${t.album}|${t.artist}`} className="h-10 w-10" rounded="rounded-md" />
          <div className="min-w-0">
            <div className="truncate text-body font-medium">{t.title}</div>
            <div className="truncate text-caption text-fg-2">{t.artist}</div>
          </div>
        </button>
        {controls && (
          <>
            <button className="press tap text-fg-3" onClick={onRemove} aria-label={`Remove ${t.title} from queue`}><TrashIcon size={18} /></button>
            <button
              className="tap cursor-grab text-fg-3" style={{ touchAction: 'none' }} aria-label={`Reorder ${t.title}. Drag, or use the up and down arrow keys`}
              onPointerDown={(e) => { handle.current = { y0: e.clientY, id: e.pointerId }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* old browsers */ } onDragStart(el.current?.offsetHeight ?? 52); }}
              onPointerMove={(e) => { if (e.pointerId === handle.current.id) onDragMove(e.clientY - handle.current.y0); }}
              onPointerUp={(e) => { if (e.pointerId === handle.current.id) { handle.current.id = -1; onDragEnd(); } }}
              onPointerCancel={(e) => { if (e.pointerId === handle.current.id) { handle.current.id = -1; onDragEnd(); } }}
              onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onStep(e.key === 'ArrowUp' ? -1 : 1); } }}
            ><GripIcon size={20} /></button>
          </>
        )}
      </div>
    </div>
  );
}

function LyricsTab({ track, touch }: { track: Track; touch: Touchy }) {
  const [menu, setMenu] = useState(false);
  const [paste, setPaste] = useState(false);
  const [sync, setSync] = useState(false);
  const stored = useLiveQuery(() => db.lyrics.get(track.id).then((l) => l ?? null), [track.id]);
  const has = !!stored;
  const picker = useLyricFilePicker(track);
  const shown = stored ? displayLyrics(stored) : null;
  const syncLines = shown ? (shown.kind === 'synced' ? (shown.lines ?? []).map((l) => l.text).filter(Boolean) : linesToSync(shown.text ?? '')) : [];
  return (
    <>
      {/* Small cover, title and artist, then options and close: the song stays in view while reading. */}
      <header className="relative shrink-0 px-gutter pb-2" style={{ paddingTop: 'calc(var(--sat) + 0.5rem)', touchAction: 'none' }}
        onTouchStart={touch.onStart} onTouchMove={touch.onMove} onTouchEnd={touch.onEnd} onTouchCancel={touch.onEnd} data-lyrics-header>
        <div className="flex items-center gap-3">
          <Art trackId={track.hasArt ? track.id : undefined} seed={`${track.album}|${track.artist}`} className="h-12 w-12" rounded="rounded-lg" shadow />
          <div className="min-w-0 flex-1">
            <div className="text-body-lg font-semibold leading-tight"><Marquee key={track.id} text={track.title} /></div>
            <div className="truncate text-footnote text-fg-2">{track.artist}</div>
          </div>
          <CircleButton label="Lyrics options" onClick={() => setMenu(true)}><MoreIcon size={18} /></CircleButton>
          <CircleButton label="Back to player" onClick={() => ui.setPlayerTab('now')}><CloseIcon size={18} /></CircleButton>
        </div>
      </header>
      <LyricsView track={track} />
      <Transport compact />
      {picker.el}
      {menu && (
        <Sheet title="Lyrics" onClose={() => setMenu(false)}>
          <SheetItem icon={<QuoteIcon size={20} />} label={has ? 'Replace from .lrc / .ttml / .txt' : 'Add .lrc / .ttml / .txt'} onClick={() => { setMenu(false); picker.open(); }} />
          <SheetItem icon={<QuoteIcon size={20} />} label="Paste lyrics" onClick={() => { setMenu(false); setPaste(true); }} />
          {syncLines.length > 0 && <SheetItem icon={<TimingIcon size={20} />} label={stored?.kind === 'synced' ? 'Re-sync to song' : 'Sync to song'} onClick={() => { setMenu(false); setSync(true); }} />}
          {stored?.kind === 'synced' && <TimingNudge trackId={track.id} offset={stored.offset ?? 0} />}
          {has && <SheetItem danger icon={<TrashIcon size={20} />} label="Remove lyrics" onClick={async () => { await removeLyrics(track.id); setMenu(false); ui.toast('Lyrics removed'); }} />}
        </Sheet>
      )}
      {paste && <PasteLyricsSheet track={track} onClose={() => setPaste(false)} />}
      {sync && <SyncLyricsSheet track={track} lines={syncLines} onClose={() => setSync(false)} />}
    </>
  );
}

/** Moves every synced line earlier or later in half-second steps, for files whose timing is a little off. */
function TimingNudge({ trackId, offset }: { trackId: string; offset: number }) {
  const set = (v: number) => { haptic(); void db.lyrics.update(trackId, { offset: clampOffset(v) }); };
  const label = offset === 0 ? 'Matches the file' : `${Math.abs(offset).toFixed(1)} s ${offset > 0 ? 'later' : 'earlier'}`;
  return (
    <div className="flex min-h-[3.25rem] flex-wrap items-center gap-x-4 gap-y-2 px-1 py-1.5" role="group" aria-label="Lyrics timing">
      <span className="flex w-6 justify-center text-fg-2"><TimingIcon size={20} /></span>
      <span className="min-w-[6rem] flex-1">
        <span className="block text-body-lg">Timing</span>
        <span className="block text-footnote text-fg-3" aria-live="polite" data-lyrics-offset>{label}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
      <button className="press h-9 rounded-full bg-s3 px-3 text-footnote font-semibold" onClick={() => set(offset - 0.5)} aria-label="Show lyrics half a second earlier">−0.5 s</button>
      <button className="press h-9 rounded-full bg-s3 px-3 text-footnote font-semibold" onClick={() => set(offset + 0.5)} aria-label="Show lyrics half a second later">+0.5 s</button>
      {offset !== 0 && <button className="press h-9 rounded-full px-2 text-footnote font-semibold text-fg-2" onClick={() => set(0)}>Reset</button>}
      </span>
    </div>
  );
}

const SLEEP_OPTIONS: [number | 'track' | null, string][] = [[null, 'Off'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], ['track', 'End of track']];

function SleepSheet({ onClose }: { onClose: () => void }) {
  const s = usePlayer();
  const p = getPlayer();
  const current: number | 'track' | null = s.sleepEndOfTrack ? 'track' : null;
  return (
    <Sheet title="Sleep timer" onClose={onClose}>
      {SLEEP_OPTIONS.map(([v, label]) => (
        <SheetItem key={String(v)} label={label} selected={v === null ? !s.sleepEndsAt && !s.sleepEndOfTrack : v === current} onClick={() => { haptic(); p.setSleep(v); ui.toast(v === null ? 'Sleep timer off' : v === 'track' ? 'Stopping after this track' : `Stopping in ${label}`); onClose(); }} />
      ))}
    </Sheet>
  );
}

/** Remaining time label that ticks while a timer is running. */
function useSleepLabel(): string {
  const { sleepEndsAt, sleepEndOfTrack } = usePlayer();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!sleepEndsAt) return;
    const id = setInterval(() => tick((n) => n + 1), 15_000); // re-render so the label counts down
    return () => clearInterval(id);
  }, [sleepEndsAt]);
  if (sleepEndOfTrack) return 'End of track';
  if (sleepEndsAt) return `${Math.max(1, Math.ceil((sleepEndsAt - Date.now()) / 60_000))} min`;
  return 'Sleep';
}

function Transport({ compact }: { compact?: boolean }) {
  const s = usePlayer();
  const { currentTime, duration } = usePlaybackTime();
  const { playerTab } = useUI();
  const p = getPlayer();
  const [scrub, setScrub] = useState<number | null>(null);
  const [sleep, setSleep] = useState(false);
  const sleepLabel = useSleepLabel();
  const dur = duration || s.track?.duration || 0;
  const value = scrub ?? currentTime;
  const commit = () => { if (scrub !== null) { p.seek(scrub); setScrub(null); } };
  const { shuffle, repeat } = s.queue;
  const msg = s.error ?? (s.interrupted ? 'Playback was interrupted. Tap play to resume.' : null);
  const sleeping = !!s.sleepEndsAt || s.sleepEndOfTrack;
  return (
    <div className="relative shrink-0 px-gutter" style={{ paddingBottom: 'calc(var(--sab) + 0.75rem)' }}>
      <div className="mx-auto w-full max-w-[26rem]">
        <SeekBar value={value} duration={dur} onScrub={setScrub} onCommit={commit} />
        <div className="-mt-1 flex justify-between text-caption tabular-nums text-fg-2"><span>{formatTime(value)}</span><span>{formatRemaining(dur, value)}</span></div>
        {msg && <p className="mt-1 text-center text-caption text-fg-2" role="status">{msg}</p>}

        {compact ? (
          <div className="mt-1 flex items-center justify-center gap-8">
            <button className="press tap h-12 w-12 rounded-full" onClick={() => void p.previous()} aria-label="Previous track"><PrevIcon size={28} /></button>
            <PlayButton size="sm" />
            <button className="press tap h-12 w-12 rounded-full" onClick={() => void p.next()} aria-label="Next track"><NextIcon size={28} /></button>
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-[1fr_1fr_auto_1fr_1fr] items-center justify-items-center">
            <IconToggle active={shuffle} label={shuffle ? 'Shuffle on' : 'Shuffle off'} onClick={() => p.toggleShuffle()}><ShuffleIcon size={22} /></IconToggle>
            <button className="press tap h-[min(3rem,12vw)] w-[min(3rem,12vw)] min-h-0 min-w-0 rounded-full" onClick={() => void p.previous()} aria-label="Previous track"><PrevIcon size={30} /></button>
            <PlayButton />
            <button className="press tap h-[min(3rem,12vw)] w-[min(3rem,12vw)] min-h-0 min-w-0 rounded-full" onClick={() => void p.next()} aria-label="Next track"><NextIcon size={30} /></button>
            <IconToggle active={repeat !== 'off'} label={`Repeat ${repeat}`} onClick={() => p.cycleRepeat()}>{repeat === 'one' ? <RepeatOneIcon size={22} /> : <RepeatIcon size={22} />}</IconToggle>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Pill active={playerTab === 'queue'} onClick={() => ui.setPlayerTab(playerTab === 'queue' ? 'now' : 'queue')} label={playerTab === 'queue' ? 'Hide queue' : 'Show queue'}><QueueIcon size={16} className="shrink-0" />Queue</Pill>
          <Pill active={sleeping} onClick={() => setSleep(true)} label="Sleep timer"><MoonIcon size={16} className="shrink-0" /><span className="truncate">{sleepLabel}</span></Pill>
          <Pill active={playerTab === 'lyrics'} onClick={() => ui.setPlayerTab(playerTab === 'lyrics' ? 'now' : 'lyrics')} label={playerTab === 'lyrics' ? 'Hide lyrics' : 'Show lyrics'}><QuoteIcon size={16} className="shrink-0" />Lyrics</Pill>
        </div>
      </div>
      {sleep && <SleepSheet onClose={() => setSleep(false)} />}
    </div>
  );
}

function PlayButton({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const s = usePlayer();
  const p = getPlayer();
  const lg = size === 'lg';
  return (
    <button
      className={`press flex items-center justify-center bg-fg text-black shadow-float ${lg ? 'h-[min(4.5rem,19vw)] w-[min(4.5rem,19vw)] rounded-[min(1.375rem,6vw)]' : 'h-14 w-14 rounded-xl'}`}
      onClick={() => { haptic(); void p.toggle(); }} aria-label={s.isPlaying ? 'Pause' : 'Play'}
    >
      {s.isPlaying ? <PauseIcon size={lg ? 32 : 26} /> : <PlayIcon size={lg ? 32 : 26} className="ml-0.5" />}
    </button>
  );
}

function IconToggle({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`press tap relative h-[min(3rem,12vw)] w-[min(3rem,12vw)] min-h-0 min-w-0 flex-col rounded-full ${active ? 'text-fg' : 'text-fg-3'}`} onClick={onClick} aria-label={label} aria-pressed={active}>
      {children}
      <span className={`mt-0.5 h-1 w-1 rounded-full bg-fg transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`} />
    </button>
  );
}

function Pill({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button className={`press flex h-10 min-w-0 flex-1 basis-[5.5rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-footnote font-semibold ${active ? 'bg-fg text-black' : 'bg-white/[0.09] text-fg'}`} onClick={onClick} aria-label={label} aria-pressed={active}>{children}</button>
  );
}
