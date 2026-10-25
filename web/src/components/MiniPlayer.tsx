import { getPlayer, usePlayer, usePlaybackTime } from '../lib/player';
import { ui } from '../lib/ui';
import { Art } from './Art';
import { NextIcon, PauseIcon, PlayIcon } from './Icons';

export function MiniPlayer() {
  const s = usePlayer();
  const { currentTime, duration } = usePlaybackTime();
  const p = getPlayer();
  if (!s.track) return null;
  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  return (
    <div className="px-2 pb-1.5">
      <div className="glass relative overflow-hidden rounded-2xl border border-white/10 shadow-xl shadow-black/60">
        <div className="flex items-center gap-3 p-2 pr-3">
          <button className="press flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => ui.openPlayer('now')} aria-label="Open player">
            <Art trackId={s.track.hasArt ? s.track.id : undefined} seed={s.track.album} className="h-11 w-11" rounded="rounded-lg" />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{s.track.title}</div>
              <div className="truncate text-[12px] text-white/55">{s.error ?? (s.interrupted ? 'Paused · interrupted' : s.track.artist)}</div>
            </div>
          </button>
          <button className="press flex h-10 w-10 items-center justify-center rounded-full bg-white text-black" onClick={() => void p.toggle()} aria-label={s.isPlaying ? 'Pause' : 'Play'}>
            {s.isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          </button>
          <button className="press flex h-10 w-10 items-center justify-center text-white/80" onClick={() => void p.next()} aria-label="Next">
            <NextIcon size={22} />
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
          <div className="h-full bg-violet-400" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
