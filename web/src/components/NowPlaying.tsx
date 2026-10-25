import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { toggleFavorite } from '../lib/library';
import { getPlayer, usePlayer, usePlaybackTime } from '../lib/player';
import { formatTime } from '../lib/storage';
import { ui, useUI } from '../lib/ui';
import type { Track } from '../lib/types';
import { Art } from './Art';
import {
  ChevronDown, DownIcon, HeartIcon, MoreIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, QueueIcon,
  RepeatIcon, RepeatOneIcon, ShuffleIcon, TrashIcon, UpIcon,
} from './Icons';

/** Always mounted so the mini-player -> full-player move is a CSS transition both ways. */
export function NowPlaying() {
  const { playerOpen, playerTab } = useUI();
  const s = usePlayer();
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const t = s.track;
  const open = playerOpen && !!t;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      aria-hidden={!open}
      style={{
        transform: open ? `translateY(${drag}px)` : 'translateY(100%)',
        transition: drag ? 'none' : 'transform .38s cubic-bezier(.2,.8,.2,1), visibility 0s linear ' + (open ? '0s' : '.38s'),
        visibility: open ? 'visible' : 'hidden',
        background: 'linear-gradient(180deg, #1a0f33 0%, #0a0714 45%, #000 100%)',
      }}
    >
      <div className="violet-glow pointer-events-none absolute inset-0" />
      <div
        className="relative flex items-center justify-between px-safe pt-safe pb-2"
        style={{ paddingTop: 'calc(var(--sat) + 8px)', touchAction: 'none' }}
        onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
        onTouchMove={(e) => { if (startY.current !== null) setDrag(Math.max(0, e.touches[0].clientY - startY.current)); }}
        onTouchEnd={() => { if (drag > 120) ui.closePlayer(); setDrag(0); startY.current = null; }}
      >
        <button className="press p-2" onClick={ui.closePlayer} aria-label="Close player"><ChevronDown size={28} /></button>
        <div className="flex rounded-full bg-white/10 p-1 text-sm">
          {(['now', 'queue'] as const).map((tab) => (
            <button key={tab} onClick={() => ui.setPlayerTab(tab)} className={`rounded-full px-4 py-1.5 transition-colors ${playerTab === tab ? 'bg-white text-black font-semibold' : 'text-white/70'}`}>
              {tab === 'now' ? 'Now Playing' : 'Queue'}
            </button>
          ))}
        </div>
        <button className="press p-2" onClick={() => t && ui.openTrackSheet(t.id)} aria-label="More"><MoreIcon size={24} /></button>
      </div>
      {t && (playerTab === 'now' ? <NowTab track={t} /> : <QueueTab />)}
      {t && <Controls />}
      <p className="relative px-6 pb-safe text-center text-[11px] text-white/30" style={{ paddingBottom: 'calc(var(--sab) + 10px)' }}>
        {s.error ?? (s.interrupted ? 'Playback was interrupted. Tap play to resume.' : '')}
      </p>
    </div>
  );
}

function NowTab({ track }: { track: Track }) {
  const s = usePlayer();
  const fav = useLiveQuery(() => db.tracks.get(track.id).then((t) => !!t?.favorite), [track.id]);
  const nav = useNavigate();
  return (
    <div className="relative flex flex-1 flex-col justify-center px-8">
      <div className={`mx-auto w-full max-w-[22rem] transition-transform duration-500 ${s.isPlaying ? 'scale-100' : 'scale-[.88]'}`}>
        <Art trackId={track.hasArt ? track.id : undefined} seed={track.album} rounded="rounded-3xl" className="w-full shadow-2xl shadow-violet-950/70" />
      </div>
      <div className="mx-auto mt-7 flex w-full max-w-[22rem] items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[22px] font-bold">{track.title}</div>
          <button className="block max-w-full truncate text-[16px] text-violet-300" onClick={() => { ui.closePlayer(); nav(`/library/artists/${encodeURIComponent(track.artist)}`); }}>{track.artist}</button>
          {track.license && <div className="mt-0.5 truncate text-[11px] text-white/40">{track.license.name} · {track.license.attribution}</div>}
        </div>
        <button className={`press p-2 ${fav ? 'text-violet-400' : 'text-white/60'}`} onClick={() => void toggleFavorite(track.id)} aria-label="Favorite"><HeartIcon size={26} filled={!!fav} /></button>
      </div>
    </div>
  );
}

function QueueTab() {
  const s = usePlayer();
  const p = getPlayer();
  const tracks = useLiveQuery(() => db.tracks.bulkGet(s.queue.items), [s.queue.items]);
  const { items, index } = s.queue;
  return (
    <div className="scroll-y hide-scroll relative flex-1 px-safe">
      <div className="flex items-center justify-between py-2">
        <div className="text-sm text-white/50">{items.length} in queue{s.queue.shuffle ? ' · shuffled' : ''}</div>
        {index < items.length - 1 && <button className="press text-sm text-violet-300" onClick={() => p.clearUpcoming()}>Clear upcoming</button>}
      </div>
      {items.map((id, i) => {
        const t = tracks?.[i];
        if (!t) return null;
        const cur = i === index;
        return (
          <div key={id + i} className={`flex items-center gap-2 rounded-xl py-1.5 ${cur ? 'bg-white/10' : ''}`}>
            <button className="press flex min-w-0 flex-1 items-center gap-3 px-2 text-left" onClick={() => void p.playIndex(i)}>
              <Art trackId={t.hasArt ? t.id : undefined} seed={t.album} className="h-11 w-11" rounded="rounded-lg" />
              <div className="min-w-0">
                <div className={`truncate text-[15px] ${cur ? 'font-semibold text-violet-300' : ''}`}>{t.title}</div>
                <div className="truncate text-xs text-white/50">{t.artist}</div>
              </div>
            </button>
            <button className="press p-2 text-white/50 disabled:opacity-20" disabled={i === 0} onClick={() => p.moveInQueue(i, i - 1)} aria-label="Move up"><UpIcon size={18} /></button>
            <button className="press p-2 text-white/50 disabled:opacity-20" disabled={i === items.length - 1} onClick={() => p.moveInQueue(i, i + 1)} aria-label="Move down"><DownIcon size={18} /></button>
            <button className="press p-2 text-white/50" onClick={() => void p.removeFromQueue(i)} aria-label="Remove from queue"><TrashIcon size={18} /></button>
          </div>
        );
      })}
      <div className="h-6" />
    </div>
  );
}

function Controls() {
  const s = usePlayer();
  const { currentTime, duration } = usePlaybackTime();
  const p = getPlayer();
  const [scrub, setScrub] = useState<number | null>(null);
  const dur = duration || s.track?.duration || 0;
  const value = scrub ?? currentTime;
  const pct = dur ? Math.min(100, (value / dur) * 100) : 0;
  const commit = () => { if (scrub !== null) { p.seek(scrub); setScrub(null); } };
  const { shuffle, repeat } = s.queue;
  return (
    <div className="relative mx-auto w-full max-w-[24rem] px-8 pb-2 pt-4">
      <input
        type="range" className="seek" min={0} max={dur || 1} step={0.1} value={Math.min(value, dur || 1)}
        style={{ ['--p' as string]: `${pct}%` }}
        aria-label="Seek"
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={commit} onTouchEnd={commit} onKeyUp={commit} onBlur={commit}
      />
      <div className="-mt-1 flex justify-between text-xs tabular-nums text-white/50"><span>{formatTime(value)}</span><span>-{formatTime(Math.max(dur - value, 0))}</span></div>
      <div className="mt-3 flex items-center justify-between">
        <button className={`press p-3 ${shuffle ? 'text-violet-400' : 'text-white/60'}`} onClick={() => p.toggleShuffle()} aria-label="Shuffle" aria-pressed={shuffle}><ShuffleIcon size={24} /></button>
        <button className="press p-3" onClick={() => void p.previous()} aria-label="Previous"><PrevIcon size={34} /></button>
        <button className="press flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white text-black shadow-lg shadow-violet-900/50" onClick={() => void p.toggle()} aria-label={s.isPlaying ? 'Pause' : 'Play'}>
          {s.isPlaying ? <PauseIcon size={34} /> : <PlayIcon size={34} className="ml-1" />}
        </button>
        <button className="press p-3" onClick={() => void p.next()} aria-label="Next"><NextIcon size={34} /></button>
        <button className={`press p-3 ${repeat !== 'off' ? 'text-violet-400' : 'text-white/60'}`} onClick={() => p.cycleRepeat()} aria-label={`Repeat ${repeat}`}>
          {repeat === 'one' ? <RepeatOneIcon size={24} /> : <RepeatIcon size={24} />}
        </button>
      </div>
      <div className="mt-1 flex justify-center">
        <button className="press flex items-center gap-2 p-2 text-sm text-white/50" onClick={() => ui.setPlayerTab('queue')}>
          <QueueIcon size={18} /> Queue
        </button>
      </div>
    </div>
  );
}
