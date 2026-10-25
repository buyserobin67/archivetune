import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Q from '../lib/queue';
import { db } from '../lib/db';
import { toggleFavorite } from '../lib/library';
import { removeLyrics } from '../lib/lyrics';
import { useArtThumb, useGlobalAccent } from '../lib/accent';
import { getPlayer, usePlayer, usePlaybackTime } from '../lib/player';
import { rgbCss, type Palette } from '../lib/palette';
import { formatTime } from '../lib/storage';
import { supportsViewTransitions, ui, useUI } from '../lib/ui';
import type { Track } from '../lib/types';
import { Art } from './Art';
import { LyricsView, PasteLyricsSheet, useLyricFilePicker } from './LyricsView';
import { Sheet, SheetItem } from './Sheets';
import {
  ChevronDown, DownIcon, HeartIcon, MoonIcon, MoreIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, QueueIcon,
  QuoteIcon, RepeatIcon, RepeatOneIcon, ShuffleIcon, TrashIcon, UpIcon,
} from './Icons';

const DISMISS_DISTANCE = 130;
const DISMISS_VELOCITY = 0.55; // px per ms

type Touchy = { onStart: (e: React.TouchEvent) => void; onMove: (e: React.TouchEvent) => void; onEnd: () => void };

/** Flat charcoal with a faint artwork tint. The lyrics view adds a soft blurred cover. Cross-fades between tracks. */
function Backdrop({ palette, trackId, blur }: { palette: Palette; trackId?: string; blur: boolean }) {
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
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-bg" aria-hidden="true">
      {layers.map((l, i) => (
        <div key={l.id} className={`absolute inset-0 ${i > 0 ? 'animate-fade' : ''}`} style={{ animationDuration: '700ms' }}>
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
      <Backdrop palette={palette} trackId={t?.hasArt ? t.id : undefined} blur={playerTab === 'lyrics'} />
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
function Header({ eyebrow, title, touch, left, right }: { eyebrow: string; title: string; touch: Touchy; left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="relative shrink-0 px-gutter pb-2" style={{ paddingTop: 'calc(var(--sat) + 0.5rem)', touchAction: 'none' }} onTouchStart={touch.onStart} onTouchMove={touch.onMove} onTouchEnd={touch.onEnd} onTouchCancel={touch.onEnd}>
      <div className="flex items-center justify-between gap-2">
        {left ?? <CircleButton label="Close player" onClick={() => ui.closePlayer()}><ChevronDown size={22} /></CircleButton>}
        <div className="min-w-0 flex-1 text-center">
          <div className="eyebrow truncate">{eyebrow}</div>
          <div className="truncate text-footnote font-semibold">{title}</div>
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
  return (
    <>
      <Header eyebrow="Playing from" title={track.album === 'Unknown Album' ? track.artist : track.album} touch={touch} />
      {/* Cover + title are one group, centred in the free space. The cover is capped (20rem, 42% of the height) so tall phones don't get a giant cover. */}
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-gutter" style={{ touchAction: 'none', ['--cw' as string]: 'min(100%, 20rem)' }} onTouchStart={touch.onStart} onTouchMove={touch.onMove} onTouchEnd={touch.onEnd} onTouchCancel={touch.onEnd}>
        {/* my-auto centres the group when there is room and lets it scroll (instead of overlapping the controls) when text is very large. */}
        <div className="my-auto flex w-full flex-col items-center gap-4 py-2">
        <div className="w-[min(var(--cw),42dvh,max(7.5rem,calc(100dvh-22rem-var(--sat)-var(--sab))))] transition-transform duration-slow ease-spring" style={{ transform: s.isPlaying ? 'scale(1)' : 'scale(.92)' }}>
          <Art trackId={track.hasArt ? track.id : undefined} seed={`${track.album}|${track.artist}`} className="w-full" rounded="rounded-xl" vtName={playerOpen ? 'cadence-art' : undefined} shadow priority />
        </div>
        <div className="flex w-[var(--cw)] items-center gap-2" style={{ touchAction: 'auto' }}>
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-title font-bold leading-tight">{track.title}</h2>
            <div className="truncate text-body text-fg-2">{track.artist}</div>
            {track.license && <div className="truncate text-caption text-fg-3">{track.license.name} · {track.license.attribution}</div>}
          </div>
          <CircleButton label={fav ? 'Remove from favorites' : 'Add to favorites'} pressed={!!fav} onClick={() => void toggleFavorite(track.id)}><HeartIcon size={18} filled={!!fav} /></CircleButton>
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
  const tracks = useLiveQuery(() => db.tracks.bulkGet(s.queue.items), [s.queue.items]);
  const { items, index, repeat } = s.queue;
  const [showHistory, setShowHistory] = useState(false);
  const after = Q.afterCurrent(s.queue);
  const nextCount = Q.upcoming(s.queue).length;
  const byIndex = (i: number) => tracks?.[i] ?? null;
  const title = (i: number) => byIndex(i)?.title ?? 'this song';
  const row = (i: number, opts: { controls: boolean; dim?: boolean }) => {
    const t = byIndex(i);
    if (!t) return null;
    return (
      <div key={`${items[i]}:${i}`} className={`flex items-center gap-1 pl-gutter pr-1 ${opts.dim ? 'opacity-55' : ''}`}>
        <button className="press flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left" onClick={() => void p.playIndex(i)}>
          <Art trackId={t.hasArt ? t.id : undefined} seed={`${t.album}|${t.artist}`} className="h-10 w-10" rounded="rounded-md" />
          <div className="min-w-0">
            <div className="truncate text-body font-medium">{t.title}</div>
            <div className="truncate text-caption text-fg-2">{t.artist}</div>
          </div>
        </button>
        {opts.controls && (
          <>
            <button className="press tap text-fg-3 disabled:opacity-20" disabled={i <= index + 1} onClick={() => p.moveInQueue(i, i - 1)} aria-label={`Move ${t.title} up`}><UpIcon size={18} /></button>
            <button className="press tap text-fg-3 disabled:opacity-20" disabled={i === items.length - 1} onClick={() => p.moveInQueue(i, i + 1)} aria-label={`Move ${t.title} down`}><DownIcon size={18} /></button>
            <button className="press tap text-fg-3" onClick={() => void p.removeFromQueue(i)} aria-label={`Remove ${t.title} from queue`}><TrashIcon size={18} /></button>
          </>
        )}
      </div>
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
        <div className="scroll-y hide-scroll relative min-h-0 flex-1" style={{ maskImage: 'linear-gradient(to bottom, transparent, #000 0.5rem, #000 calc(100% - 0.75rem), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 0.5rem, #000 calc(100% - 0.75rem), transparent)' }}>
          {after.kind === 'repeat-one' && <p className="px-gutter py-2 text-footnote text-fg-2">Repeating “{track.title}”. Turn repeat off to continue to the next song.</p>}
          {nextCount === 0 && after.kind !== 'repeat-one' && (
            <p className="px-gutter py-2 text-footnote text-fg-2">
              {after.kind === 'wrap'
                ? after.same ? `Repeat is on: “${track.title}” will play again.` : `Nothing else is queued. Repeat is on, so playback returns to “${title(0)}”.`
                : 'Nothing queued after this song. Add songs from the ••• menu.'}
            </p>
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

function LyricsTab({ track, touch }: { track: Track; touch: Touchy }) {
  const [menu, setMenu] = useState(false);
  const [paste, setPaste] = useState(false);
  const has = useLiveQuery(() => db.lyrics.get(track.id).then((l) => !!l), [track.id]);
  const picker = useLyricFilePicker(track);
  return (
    <>
      <Header
        eyebrow={track.artist} title={track.title} touch={touch}
        left={<CircleButton label="Back to player" onClick={() => ui.setPlayerTab('now')}><ChevronDown size={22} /></CircleButton>}
        right={<CircleButton label="Lyrics options" onClick={() => setMenu(true)}><MoreIcon size={18} /></CircleButton>}
      />
      <LyricsView track={track} />
      <Transport compact />
      {picker.el}
      {menu && (
        <Sheet title="Lyrics" onClose={() => setMenu(false)}>
          <SheetItem icon={<QuoteIcon size={20} />} label={has ? 'Replace from .lrc / .txt file' : 'Add .lrc / .txt file'} onClick={() => { setMenu(false); picker.open(); }} />
          <SheetItem icon={<QuoteIcon size={20} />} label="Paste lyrics" onClick={() => { setMenu(false); setPaste(true); }} />
          {has && <SheetItem danger icon={<TrashIcon size={20} />} label="Remove lyrics" onClick={async () => { await removeLyrics(track.id); setMenu(false); ui.toast('Lyrics removed'); }} />}
        </Sheet>
      )}
      {paste && <PasteLyricsSheet track={track} onClose={() => setPaste(false)} />}
    </>
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
        <SheetItem key={String(v)} label={label} selected={v === null ? !s.sleepEndsAt && !s.sleepEndOfTrack : v === current} onClick={() => { p.setSleep(v); ui.toast(v === null ? 'Sleep timer off' : v === 'track' ? 'Stopping after this track' : `Stopping in ${label}`); onClose(); }} />
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
  const pct = dur ? Math.min(100, (value / dur) * 100) : 0;
  const commit = () => { if (scrub !== null) { p.seek(scrub); setScrub(null); } };
  const { shuffle, repeat } = s.queue;
  const msg = s.error ?? (s.interrupted ? 'Playback was interrupted. Tap play to resume.' : null);
  const sleeping = !!s.sleepEndsAt || s.sleepEndOfTrack;
  return (
    <div className="relative shrink-0 px-gutter" style={{ paddingBottom: 'calc(var(--sab) + 0.75rem)' }}>
      <div className="mx-auto w-full max-w-[26rem]">
        <input
          type="range" className="seek" min={0} max={dur || 1} step={0.1} value={Math.min(value, dur || 1)}
          style={{ ['--p' as string]: `${pct}%` }} aria-label="Seek" aria-valuetext={`${formatTime(value)} of ${formatTime(dur)}`}
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={commit} onTouchEnd={commit} onKeyUp={commit} onBlur={commit}
        />
        <div className="-mt-1 flex justify-between text-caption tabular-nums text-fg-2"><span>{formatTime(value)}</span><span>-{formatTime(Math.max(dur - value, 0))}</span></div>
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
      onClick={() => void p.toggle()} aria-label={s.isPlaying ? 'Pause' : 'Play'}
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
