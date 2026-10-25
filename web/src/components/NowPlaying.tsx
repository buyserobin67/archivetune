import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { toggleFavorite } from '../lib/library';
import { useArtThumb, useGlobalAccent } from '../lib/accent';
import { getPlayer, usePlayer, usePlaybackTime } from '../lib/player';
import { rgbCss, type Palette } from '../lib/palette';
import { formatTime } from '../lib/storage';
import { supportsViewTransitions, ui, useUI } from '../lib/ui';
import type { Track } from '../lib/types';
import { Art } from './Art';
import {
  ChevronDown, DownIcon, HeartIcon, MoreIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, QueueIcon,
  RepeatIcon, RepeatOneIcon, ShuffleIcon, TrashIcon, UpIcon,
} from './Icons';

const DISMISS_DISTANCE = 130;
const DISMISS_VELOCITY = 0.55; // px per ms

/** Ambient backdrop: artwork colours as soft gradients plus a tiny cover scaled up and blurred. Cross-fades between tracks. */
function Backdrop({ palette, trackId }: { palette: Palette; trackId?: string }) {
  const thumb = useArtThumb(trackId);
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
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-bg" aria-hidden="true">
      {layers.map((l, i) => (
        <div key={l.id} className={`absolute inset-0 ${i > 0 ? 'animate-fade' : ''}`} style={{ animationDuration: '700ms' }}>
          {l.thumb && <img src={l.thumb} alt="" className="absolute inset-0 h-full w-full scale-150 object-cover opacity-45 blur-2xl saturate-150" />}
          <div className="absolute inset-0" style={{
            background: `radial-gradient(120% 60% at 50% -5%, rgb(${rgbCss(l.palette.accent)} / .55), transparent 70%), radial-gradient(90% 50% at 100% 55%, rgb(${rgbCss(l.palette.accent2)} / .35), transparent 70%), linear-gradient(to bottom, rgb(${rgbCss(l.palette.tint)} / .55) 0%, rgb(5 5 7 / .86) 62%, #050507 100%)`,
          }} />
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
  const onStart = (e: React.TouchEvent) => { drag.current = { y0: e.touches[0].clientY, t0: performance.now(), dy: 0, on: true }; };
  const onMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d.on || !root.current) return;
    d.dy = Math.max(0, e.touches[0].clientY - d.y0);
    const k = Math.min(d.dy / 600, 0.06);
    root.current.style.transition = 'none';
    root.current.style.transform = `translateY(${d.dy}px) scale(${1 - k})`;
    root.current.style.borderRadius = `${Math.min(d.dy / 4, 32)}px`;
  };
  const onEnd = () => {
    const d = drag.current, el = root.current;
    if (!d.on || !el) return;
    d.on = false;
    const v = d.dy / Math.max(performance.now() - d.t0, 1);
    const dismiss = d.dy > DISMISS_DISTANCE || (v > DISMISS_VELOCITY && d.dy > 30);
    el.style.transition = 'transform .32s cubic-bezier(.2,.8,.2,1), border-radius .32s';
    if (dismiss) {
      el.style.transform = 'translateY(105%)';
      window.setTimeout(() => ui.closePlayer(false), 300);
    } else {
      el.style.transform = 'translateY(0) scale(1)';
      el.style.borderRadius = '0px';
    }
  };
  // Re-opening clears whatever the gesture left behind.
  useEffect(() => {
    if (open && root.current) { const el = root.current; el.style.transition = ''; el.style.transform = ''; el.style.borderRadius = ''; }
  }, [open]);

  return (
    <div
      ref={root}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
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
      <Backdrop palette={palette} trackId={t?.hasArt ? t.id : undefined} />
      {t && (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Header track={t} onStart={onStart} onMove={onMove} onEnd={onEnd} />
          {playerTab === 'now' ? <Stage track={t} onStart={onStart} onMove={onMove} onEnd={onEnd} /> : <QueueStage track={t} />}
          <Transport />
        </div>
      )}
    </div>
  );
}

function Header({ track, onStart, onMove, onEnd }: { track: Track; onStart: (e: React.TouchEvent) => void; onMove: (e: React.TouchEvent) => void; onEnd: () => void }) {
  return (
    <header className="relative shrink-0 px-gutter pb-1" style={{ paddingTop: 'calc(var(--sat) + 0.375rem)', touchAction: 'none' }} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-white/30" aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <button className="press tap -ml-2 rounded-full" onClick={() => ui.closePlayer()} aria-label="Close player"><ChevronDown size={28} /></button>
        <div className="min-w-0 flex-1 text-center">
          <div className="eyebrow">Playing from</div>
          <div className="truncate text-footnote font-semibold">{track.album === 'Unknown Album' ? track.artist : track.album}</div>
        </div>
        <button className="press tap -mr-2 rounded-full" onClick={() => ui.openTrackSheet(track.id)} aria-label="More actions"><MoreIcon size={24} /></button>
      </div>
    </header>
  );
}

function Stage({ track, onStart, onMove, onEnd }: { track: Track; onStart: (e: React.TouchEvent) => void; onMove: (e: React.TouchEvent) => void; onEnd: () => void }) {
  const s = usePlayer();
  const fav = useLiveQuery(() => db.tracks.get(track.id).then((t) => t?.favorite === 1), [track.id]);
  const { playerOpen } = useUI();
  return (
    <div className="flex min-h-0 flex-1 flex-col px-gutter" style={{ touchAction: 'none' }} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      {/* The stage measures itself; the cover is the largest square that fits (container query units). */}
      <div className="flex min-h-0 flex-1 items-center justify-center py-3" style={{ containerType: 'size' }}>
        <div
          className="aspect-square transition-transform duration-slow ease-spring"
          style={{ width: 'min(100cqw, 100cqh, 24rem)', transform: s.isPlaying ? 'scale(1)' : 'scale(.86)' }}
        >
          <Art trackId={track.hasArt ? track.id : undefined} seed={`${track.album}|${track.artist}`} className="h-full w-full" rounded="rounded-xl" vtName={playerOpen ? 'cadence-art' : undefined} shadow priority />
        </div>
      </div>
      <div className="flex shrink-0 items-end gap-3 pb-1" style={{ touchAction: 'auto' }}>
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-title-lg font-bold leading-tight">{track.title}</h2>
          <div className="truncate text-body-lg text-accent-text">{track.artist}</div>
          {track.license && <div className="truncate text-caption text-fg-3">{track.license.name} · {track.license.attribution}</div>}
        </div>
        <button className={`press tap rounded-full ${fav ? 'text-accent-text' : 'text-fg-2'}`} onClick={() => void toggleFavorite(track.id)} aria-label={fav ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={!!fav}>
          <HeartIcon size={26} filled={!!fav} />
        </button>
      </div>
    </div>
  );
}

function QueueStage({ track }: { track: Track }) {
  const s = usePlayer();
  const p = getPlayer();
  const tracks = useLiveQuery(() => db.tracks.bulkGet(s.queue.items), [s.queue.items]);
  const { items, index } = s.queue;
  return (
    <div className="flex min-h-0 flex-1 animate-fade flex-col">
      <div className="flex items-center gap-3 px-gutter py-3">
        <Art trackId={track.hasArt ? track.id : undefined} seed={`${track.album}|${track.artist}`} className="h-14 w-14" rounded="rounded-md" shadow />
        <div className="min-w-0 flex-1">
          <div className="truncate text-body-lg font-semibold">{track.title}</div>
          <div className="truncate text-footnote text-accent-text">{track.artist}</div>
        </div>
      </div>
      <div className="flex items-center justify-between px-gutter pb-1">
        <div className="eyebrow">Up next · {Math.max(items.length - index - 1, 0)}{s.queue.shuffle ? ' · shuffled' : ''}</div>
        {index < items.length - 1 && <button className="press text-footnote font-semibold text-accent-text" onClick={() => p.clearUpcoming()}>Clear</button>}
      </div>
      <div className="scroll-y hide-scroll min-h-0 flex-1" style={{ maskImage: 'linear-gradient(to bottom, transparent, #000 1rem, #000 calc(100% - 1rem), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 1rem, #000 calc(100% - 1rem), transparent)' }}>
        {items.map((id, i) => {
          const t = tracks?.[i];
          if (!t) return null;
          const cur = i === index;
          return (
            <div key={id + i} className={`flex items-center gap-1 pl-gutter pr-1 ${i < index ? 'opacity-45' : ''}`}>
              <button className="press flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left" onClick={() => void p.playIndex(i)}>
                <Art trackId={t.hasArt ? t.id : undefined} seed={`${t.album}|${t.artist}`} className="h-11 w-11" rounded="rounded-md" />
                <div className="min-w-0">
                  <div className={`truncate text-body font-medium ${cur ? 'text-accent-text' : ''}`}>{t.title}</div>
                  <div className="truncate text-caption text-fg-2">{t.artist}</div>
                </div>
              </button>
              <button className="press tap text-fg-3 disabled:opacity-20" disabled={i === 0} onClick={() => p.moveInQueue(i, i - 1)} aria-label={`Move ${t.title} up`}><UpIcon size={18} /></button>
              <button className="press tap text-fg-3 disabled:opacity-20" disabled={i === items.length - 1} onClick={() => p.moveInQueue(i, i + 1)} aria-label={`Move ${t.title} down`}><DownIcon size={18} /></button>
              <button className="press tap text-fg-3" onClick={() => void p.removeFromQueue(i)} aria-label={`Remove ${t.title} from queue`}><TrashIcon size={18} /></button>
            </div>
          );
        })}
        <div className="h-3" />
      </div>
    </div>
  );
}

function Transport() {
  const s = usePlayer();
  const { currentTime, duration } = usePlaybackTime();
  const { playerTab } = useUI();
  const p = getPlayer();
  const [scrub, setScrub] = useState<number | null>(null);
  const dur = duration || s.track?.duration || 0;
  const value = scrub ?? currentTime;
  const pct = dur ? Math.min(100, (value / dur) * 100) : 0;
  const commit = () => { if (scrub !== null) { p.seek(scrub); setScrub(null); } };
  const { shuffle, repeat } = s.queue;
  const msg = s.error ?? (s.interrupted ? 'Playback was interrupted. Tap play to resume.' : null);
  return (
    <div className="relative shrink-0 px-gutter" style={{ paddingBottom: 'calc(var(--sab) + 0.75rem)' }}>
      <div className="mx-auto w-full max-w-md">
        <input
          type="range" className="seek" min={0} max={dur || 1} step={0.1} value={Math.min(value, dur || 1)}
          style={{ ['--p' as string]: `${pct}%` }} aria-label="Seek" aria-valuetext={`${formatTime(value)} of ${formatTime(dur)}`}
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={commit} onTouchEnd={commit} onKeyUp={commit} onBlur={commit}
        />
        <div className="-mt-1.5 flex justify-between text-caption tabular-nums text-fg-3"><span>{formatTime(value)}</span><span>-{formatTime(Math.max(dur - value, 0))}</span></div>
        {msg && <p className="mt-1 text-center text-caption text-accent-text" role="status">{msg}</p>}

        <div className="mt-1 flex items-center justify-between px-2">
          <button className="press tap h-14 w-14 rounded-full" onClick={() => void p.previous()} aria-label="Previous track"><PrevIcon size={36} /></button>
          <button
            className="press flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-fg text-black shadow-float"
            onClick={() => void p.toggle()} aria-label={s.isPlaying ? 'Pause' : 'Play'}
          >
            {s.isPlaying ? <PauseIcon size={34} /> : <PlayIcon size={34} className="ml-1" />}
          </button>
          <button className="press tap h-14 w-14 rounded-full" onClick={() => void p.next()} aria-label="Next track"><NextIcon size={36} /></button>
        </div>

        <div className="mt-2 flex items-center justify-between px-4">
          <ToggleIcon active={shuffle} label={shuffle ? 'Shuffle on' : 'Shuffle off'} onClick={() => p.toggleShuffle()}><ShuffleIcon size={22} /></ToggleIcon>
          <ToggleIcon active={playerTab === 'queue'} label={playerTab === 'queue' ? 'Hide queue' : 'Show queue'} onClick={() => ui.setPlayerTab(playerTab === 'queue' ? 'now' : 'queue')}><QueueIcon size={22} /></ToggleIcon>
          <ToggleIcon active={repeat !== 'off'} label={`Repeat ${repeat}`} onClick={() => p.cycleRepeat()}>{repeat === 'one' ? <RepeatOneIcon size={22} /> : <RepeatIcon size={22} />}</ToggleIcon>
        </div>
      </div>
    </div>
  );
}

function ToggleIcon({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`press tap relative flex-col rounded-full ${active ? 'text-accent-text' : 'text-fg-3'}`} onClick={onClick} aria-label={label} aria-pressed={active}>
      {children}
      <span className={`mt-0.5 h-1 w-1 rounded-full bg-accent-text transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`} />
    </button>
  );
}
