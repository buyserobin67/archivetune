import { getPlayer, usePlayer, usePlaybackTime } from '../lib/player';
import { ui, useUI } from '../lib/ui';
import { Art } from './Art';
import { NextIcon, PauseIcon, PlayIcon } from './Icons';

export function MiniPlayer() {
  const s = usePlayer();
  const { playerOpen } = useUI();
  const { currentTime, duration } = usePlaybackTime();
  const p = getPlayer();
  if (!s.track) return null;
  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  const t = s.track;
  return (
    <div className="px-2 pb-2">
      <div
        className="relative overflow-hidden rounded-xl shadow-float ring-1 ring-white/[0.08]"
        style={{ background: 'linear-gradient(100deg, color-mix(in srgb, rgb(var(--accent-rgb)) 26%, var(--surface-2)), var(--surface-2) 70%)' }}
      >
        <div className="flex items-center gap-1 py-2 pl-2 pr-1">
          <button className="press flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => ui.openPlayer('now')} aria-label={`Open player. Now playing ${t.title}`}>
            <Art trackId={t.hasArt ? t.id : undefined} seed={`${t.album}|${t.artist}`} className="h-11 w-11" rounded="rounded-md" vtName={playerOpen ? undefined : 'cadence-art'} priority />
            <div className="min-w-0 flex-1">
              <div className="truncate text-body font-semibold leading-tight">{t.title}</div>
              <div className="truncate text-caption text-fg-2">{s.error ?? (s.interrupted ? 'Paused · interrupted' : t.artist)}</div>
            </div>
          </button>
          <button className="press tap rounded-full" onClick={() => void p.toggle()} aria-label={s.isPlaying ? 'Pause' : 'Play'}>
            {s.isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
          </button>
          <button className="press tap rounded-full text-fg-2" onClick={() => void p.next()} aria-label="Next track">
            <NextIcon size={24} />
          </button>
        </div>
        <div className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full rounded-full bg-accent-text" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
