import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Group } from '../lib/library';
import type { Track } from '../lib/types';
import { Art } from './Art';
import { ChevronRight } from './Icons';

export function Section({ title, to, action, children }: { title: string; to?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-7">
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
