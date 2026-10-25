import { memo } from 'react';
import type { Track } from '../lib/types';
import { ui } from '../lib/ui';
import { usePlayer } from '../lib/player';
import { Art } from './Art';
import { HeartIcon, MoreIcon } from './Icons';

export const TrackRow = memo(function TrackRow({ track, onPlay, trailing, index }: { track: Track; onPlay: () => void; trailing?: React.ReactNode; index?: number }) {
  const { track: cur, isPlaying } = usePlayer();
  const active = cur?.id === track.id;
  return (
    <div className="cv-row flex items-center gap-1 pl-gutter pr-2">
      <button className="press flex min-w-0 flex-1 items-center gap-3 py-2 text-left" onClick={onPlay} aria-label={`Play ${track.title} by ${track.artist}`}>
        {index !== undefined && <span className="w-5 shrink-0 text-center text-footnote tabular-nums text-fg-3">{active && isPlaying ? '' : index + 1}</span>}
        <div className="relative">
          <Art trackId={track.hasArt ? track.id : undefined} seed={`${track.album}|${track.artist}`} className="h-12 w-12" rounded="rounded-md" />
          {active && <Equalizer playing={isPlaying} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-body-lg font-medium leading-snug ${active ? 'text-accent-text' : 'text-fg'}`}>{track.title}</div>
          <div className="truncate text-footnote text-fg-2">{track.artist}{track.album !== 'Unknown Album' ? ` · ${track.album}` : ''}</div>
        </div>
        {track.favorite === 1 && <HeartIcon size={14} filled className="shrink-0 text-accent-text" />}
      </button>
      {trailing}
      <button className="press tap text-fg-3" aria-label={`More actions for ${track.title}`} onClick={() => ui.openTrackSheet(track.id)}>
        <MoreIcon size={20} />
      </button>
    </div>
  );
});

function Equalizer({ playing }: { playing: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-[3px] rounded-md bg-black/55" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-4 w-[3px] origin-bottom rounded-full bg-accent-text"
          style={{ transform: playing ? undefined : 'scaleY(.35)', animation: playing ? `eq .8s ${i * 0.17}s ease-in-out infinite alternate` : 'none' }}
        />
      ))}
    </div>
  );
}
