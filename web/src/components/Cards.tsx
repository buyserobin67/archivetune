import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Group } from '../lib/library';
import type { Track } from '../lib/types';
import { getPlayer, usePlayer } from '../lib/player';
import { Art } from './Art';
import { ChevronRight, PauseIcon, PlayIcon } from './Icons';

export function Section({ title, to, action, children }: { title: string; to?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between pl-gutter pr-gutter">
        {to ? (
          <Link to={to} className="press flex items-center gap-0.5 text-title font-bold">
            {title}
            <ChevronRight size={20} className="mt-0.5 text-fg-3" />
          </Link>
        ) : <h2 className="text-title font-bold">{title}</h2>}
        {action}
      </div>
      {children}
    </section>
  );
}

/** Horizontal shelf. Edge-to-edge scroll with gutter padding, no page-level overflow. */
export function Shelf({ children }: { children: ReactNode }) {
  return <div className="row-scroll hide-scroll gap-3.5 px-gutter pb-1">{children}</div>;
}

export function TrackCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  return (
    <button className="press w-[8.75rem] text-left" onClick={onPlay} aria-label={`Play ${track.title}`}>
      <Art trackId={track.hasArt ? track.id : undefined} seed={`${track.album}|${track.artist}`} className="w-full" rounded="rounded-lg" shadow />
      <div className="mt-2 truncate text-footnote font-semibold leading-snug">{track.title}</div>
      <div className="truncate text-caption text-fg-2">{track.artist}</div>
    </button>
  );
}

export function GroupCard({ group, base, round }: { group: Group; base: string; round?: boolean }) {
  return (
    <Link to={`${base}/${encodeURIComponent(group.key)}`} className="press block w-[8.75rem] text-left">
      <Art trackId={group.artTrackId} seed={group.name} className="w-full" rounded={round ? 'rounded-full' : 'rounded-lg'} shadow />
      <div className={`mt-2 truncate text-footnote font-semibold leading-snug ${round ? 'text-center' : ''}`}>{group.name}</div>
      <div className={`truncate text-caption text-fg-2 ${round ? 'text-center' : ''}`}>{group.subtitle}</div>
    </Link>
  );
}

export function GroupGrid({ groups, base, round }: { groups: Group[]; base: string; round?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-gutter pb-4">
      {groups.map((g) => (
        <Link key={g.key} to={`${base}/${encodeURIComponent(g.key)}`} className="press block min-w-0">
          <Art trackId={g.artTrackId} seed={g.name} className="w-full" rounded={round ? 'rounded-full' : 'rounded-lg'} shadow />
          <div className={`mt-2 truncate text-body font-semibold leading-snug ${round ? 'text-center' : ''}`}>{g.name}</div>
          <div className={`truncate text-footnote text-fg-2 ${round ? 'text-center' : ''}`}>{g.subtitle}</div>
        </Link>
      ))}
    </div>
  );
}

/** Large, immersive Quick Pick card: the cover fills the card, text sits on a scrim. */
export function QuickPickCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const { track: cur, isPlaying } = usePlayer();
  const active = cur?.id === track.id;
  return (
    <div className="relative w-[10.5rem]">
      <button className="press block w-full text-left" onClick={onPlay} aria-label={`Play ${track.title} by ${track.artist}`}>
        <Art trackId={track.hasArt ? track.id : undefined} seed={`${track.album}|${track.artist}`} className="w-full" rounded="rounded-xl" shadow />
        <div className="pointer-events-none absolute inset-0 rounded-xl" style={{ background: 'linear-gradient(to top, rgb(0 0 0 / .82) 0%, rgb(0 0 0 / .25) 42%, transparent 62%)' }} />
        <div className="absolute inset-x-0 bottom-0 p-3 pr-12">
          <div className="truncate text-body font-semibold leading-tight">{track.title}</div>
          <div className="truncate text-caption text-white/70">{track.artist}</div>
        </div>
      </button>
      <button
        className="press absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-fg text-black shadow-card"
        aria-label={active && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        onClick={() => (active ? void getPlayer().toggle() : onPlay())}
      >
        {active && isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} className="ml-px" />}
      </button>
    </div>
  );
}

/** Compact Keep Listening row: cover, text, one small circular play/pause control. */
export function ListenRow({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const { track: cur, isPlaying } = usePlayer();
  const active = cur?.id === track.id;
  return (
    <div className="cv-row flex items-center gap-3 px-gutter py-1.5">
      <button className="press flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onPlay} aria-label={`Play ${track.title} by ${track.artist}`}>
        <Art trackId={track.hasArt ? track.id : undefined} seed={`${track.album}|${track.artist}`} className="h-12 w-12" rounded="rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className={`truncate text-body font-medium ${active ? 'text-art-text' : ''}`}>{track.title}</div>
          <div className="truncate text-footnote text-fg-2">{track.artist}</div>
        </div>
      </button>
      <button className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-s2" aria-label={active && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`} onClick={() => (active ? void getPlayer().toggle() : onPlay())}>
        {active && isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} className="ml-px" />}
      </button>
    </div>
  );
}

/** Clearly-labelled, non-interactive sample of what Quick Picks will look like. These are not songs. */
export function ExamplePreview() {
  return (
    <section className="mb-6" aria-label="Example layout. Not real songs.">
      <div className="mb-3 flex items-center gap-2 px-gutter">
        <h2 className="text-title font-bold text-fg-3">Quick Picks</h2>
        <span className="rounded-full bg-s2 px-2 py-0.5 text-caption font-semibold uppercase tracking-wide text-fg-2">Example</span>
      </div>
      <div className="row-scroll hide-scroll gap-3.5 px-gutter pb-1" aria-hidden="true" style={{ pointerEvents: 'none' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-[9rem] opacity-60">
            <div className="relative aspect-square overflow-hidden rounded-xl border border-dashed border-white/15 bg-s1">
              <div className="absolute inset-x-3 bottom-3 space-y-1.5">
                <div className="h-2.5 w-3/4 rounded-full bg-white/15" />
                <div className="h-2 w-1/2 rounded-full bg-white/10" />
              </div>
              <div className="absolute bottom-2.5 right-2.5 h-8 w-8 rounded-full bg-white/10" />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 px-gutter text-caption text-fg-3">Placeholder cards only. Your own songs appear here after you import them.</p>
    </section>
  );
}
