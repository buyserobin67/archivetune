import type { Track } from '../lib/types';
import { formatTime } from '../lib/storage';
import { ui } from '../lib/ui';
import { usePlayer } from '../lib/player';
import { Art } from './Art';
import { MoreIcon } from './Icons';

export function TrackRow({ track, onPlay, trailing }: { track: Track; onPlay: () => void; trailing?: React.ReactNode }) {
  const { track: cur, isPlaying } = usePlayer();
  const active = cur?.id === track.id;
  return (
    <div className="flex items-center gap-3 py-1.5 px-safe">
      <button className="press flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onPlay}>
        <div className="relative">
          <Art trackId={track.hasArt ? track.id : undefined} seed={track.album} className="h-12 w-12" rounded="rounded-lg" />
          {active && isPlaying && <Bars />}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[15px] font-medium ${active ? 'text-violet-300' : ''}`}>{track.title}</div>
          <div className="truncate text-[13px] text-white/50">{track.artist} · {formatTime(track.duration)}</div>
        </div>
      </button>
      {trailing}
      <button className="press p-2 text-white/50" aria-label={`More actions for ${track.title}`} onClick={() => ui.openTrackSheet(track.id)}>
        <MoreIcon size={20} />
      </button>
    </div>
  );
}

function Bars() {
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-[3px] rounded-lg bg-black/55 pb-3">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-[3px] rounded-full bg-violet-300" style={{ height: 14, animation: `eq 0.9s ${i * 0.15}s ease-in-out infinite alternate` }} />
      ))}
      <style>{`@keyframes eq { from { transform: scaleY(.25); transform-origin: bottom } to { transform: scaleY(1); transform-origin: bottom } }`}</style>
    </div>
  );
}
