import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Art, FallbackCover } from '../components/Art';
import { ChevronLeft, PlayIcon, ShuffleIcon, TrashIcon } from '../components/Icons';
import { TrackRow } from '../components/TrackRow';
import { groupAlbums, groupArtists } from '../lib/library';
import { useArtPalette } from '../lib/accent';
import { rgbCss } from '../lib/palette';
import { getPlayer } from '../lib/player';
import { deletePlaylist, removeFromPlaylist, renamePlaylist } from '../lib/playlists';
import { useTracks } from '../lib/hooks';
import { formatTime } from '../lib/storage';
import { ui } from '../lib/ui';
import type { Track } from '../lib/types';
import { BackBar } from './common';

function Hero({ back, trackId, seed, title, meta, round, children, collage }: {
  back: string; trackId?: string; seed: string; title: string; meta: string; round?: boolean; children?: React.ReactNode; collage?: Track[];
}) {
  const palette = useArtPalette(trackId, seed);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [compact, setCompact] = useState(false);
  // The small header fades in once the big title has scrolled under the status bar.
  useEffect(() => {
    const el = titleRef.current, root = document.getElementById('main');
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // The header covers the status bar / Dynamic Island plus its own row, so that is where the title counts as gone.
    const sat = safeTop();
    const line = Math.round(sat + 52);
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting && e.boundingClientRect.top < line), { root, rootMargin: `-${line}px 0px 0px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const tint = `rgb(${rgbCss(palette.tint)})`;
  return (
    <div className="relative">
      <CompactHeader back={back} title={title} show={compact} />
      <div className="absolute left-0 right-0 top-0 z-10"><BackBar to={back} /></div>
      {/* Edge-to-edge cover that fades into the page, like an album page in Apple Music. */}
      <div className="relative mx-auto w-full max-w-md" data-hero-cover>
        <div className="aspect-square w-full overflow-hidden" data-round={round ? '' : undefined}>
          {collage ? <Collage tracks={collage} seed={seed} /> : <Art trackId={trackId} seed={seed} className="h-full w-full" rounded="rounded-none" priority />}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5" aria-hidden="true" style={{ background: `linear-gradient(to bottom, transparent, ${tint} 70%, var(--bg))` }} />
      </div>
      <div className="relative -mt-16 flex flex-col items-center px-gutter pb-5 text-center" style={{ background: `linear-gradient(to bottom, transparent, var(--bg) 4rem)` }}>
        <h1 ref={titleRef} className="line-clamp-2 max-w-full text-title-lg font-bold drop-shadow-[0_2px_12px_rgb(0_0_0/.5)]">{title}</h1>
        <div className="mt-0.5 text-footnote text-fg-2">{meta}</div>
        {children}
      </div>
    </div>
  );
}

/** The top safe-area inset in px (--sat is an env() expression, so it has to be resolved through a real element). */
function safeTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:var(--sat)';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return px;
}

/** Small frosted header with back button and title, shown while the hero is scrolled away. */
function CompactHeader({ back, title, show }: { back: string; title: string; show: boolean }) {
  const nav = useNavigate();
  return (
    <div className={`glass fixed inset-x-0 top-0 z-20 flex items-center gap-2 rounded-none px-gutter pb-2 transition-opacity duration-fast ${show ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      style={{ paddingTop: 'calc(var(--sat) + 0.375rem)', boxShadow: 'inset 0 -0.5px 0 rgb(255 255 255 / .08)' }} aria-hidden={show ? undefined : true} data-compact-header>
      <button className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label="Back" tabIndex={show ? 0 : -1}
        onClick={() => (window.history.length > 1 ? nav(-1) : nav(back))}><ChevronLeft size={22} /></button>
      <div className="min-w-0 flex-1 truncate text-center text-body font-semibold">{title}</div>
      <span className="h-9 w-9 shrink-0" aria-hidden="true" />
    </div>
  );
}

function Collage({ tracks, seed }: { tracks: Track[]; seed: string }) {
  const withArt = tracks.filter((t) => t.hasArt).slice(0, 4);
  if (withArt.length < 4) return withArt.length ? <Art trackId={withArt[0].id} className="h-full w-full" rounded="rounded-none" /> : <div className="relative h-full w-full"><FallbackCover seed={seed} /></div>;
  return <div className="grid h-full w-full grid-cols-2 grid-rows-2">{withArt.map((t) => <Art key={t.id} trackId={t.id} className="h-full w-full" rounded="rounded-none" />)}</div>;
}

function Actions({ ids }: { ids: string[] }) {
  const p = getPlayer();
  return (
    <div className="mt-4 flex w-full max-w-xs gap-3">
      <button className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-fg font-semibold text-black" onClick={() => void p.playQueue(ids, 0)}><PlayIcon size={18} /> Play</button>
      <button className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 font-semibold" onClick={() => { p.setShuffle(true); void p.playQueue(ids, Math.floor(Math.random() * ids.length)); }}><ShuffleIcon size={18} /> Shuffle</button>
    </div>
  );
}

function Missing({ what }: { what: string }) {
  return <><BackBar to="/library/songs" /><p className="px-gutter py-16 text-center text-fg-3">That {what} is no longer in your library.</p></>;
}

/** Albums and artists share one detail screen. */
export function GroupDetail({ kind }: { kind: 'albums' | 'artists' }) {
  const { key = '' } = useParams();
  const tracks = useTracks();
  if (!tracks) return null;
  const decoded = decodeURIComponent(key);
  const g = (kind === 'albums' ? groupAlbums(tracks) : groupArtists(tracks)).find((x) => x.key === decoded);
  if (!g) return <Missing what={kind === 'albums' ? 'album' : 'artist'} />;
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const list = g.trackIds.map((id) => byId.get(id)!).filter(Boolean);
  const total = list.reduce((n, t) => n + t.duration, 0);
  const p = getPlayer();
  const ids = list.map((t) => t.id);
  const multiDisc = kind === 'albums' && new Set(list.map((t) => t.discNo ?? 1)).size > 1;
  return (
    <div className="page-enter">
      <Hero back={`/library/${kind}`} trackId={g.artTrackId} seed={g.name} title={g.name} round={kind === 'artists'}
        meta={`${kind === 'albums' ? g.subtitle + ' · ' : ''}${list.length} song${list.length === 1 ? '' : 's'} · ${formatTime(total)}`}>
        <Actions ids={ids} />
      </Hero>
      {list.map((t, i) => {
        const disc = t.discNo ?? 1;
        const divider = multiDisc && (i === 0 || (list[i - 1].discNo ?? 1) !== disc);
        return (
          <div key={t.id}>
            {divider && <h2 className="eyebrow px-gutter pb-1 pt-3" data-disc={disc}>Disc {disc}</h2>}
            <TrackRow track={t} index={kind === 'albums' ? (t.trackNo ? t.trackNo - 1 : i) : undefined} onPlay={() => void p.playQueue(ids, i)} />
          </div>
        );
      })}
    </div>
  );
}

export function PlaylistDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const pl = useLiveQuery(() => db.playlists.get(id), [id]);
  const tracks = useTracks();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  if (!pl || !tracks) return null;
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const list = pl.trackIds.map((t) => byId.get(t)).filter((t): t is Track => !!t);
  const ids = list.map((t) => t.id);
  const p = getPlayer();
  return (
    <div className="page-enter">
      <Hero back="/library/playlists" seed={pl.name} title={pl.name} meta={`Playlist · ${list.length} song${list.length === 1 ? '' : 's'}`} collage={list}>
        {list.length > 0 && <Actions ids={ids} />}
        <div className="mt-3 flex gap-5 text-footnote font-semibold">
          <button className="press text-accent-text" onClick={() => { setName(pl.name); setRenaming(true); }}>Rename</button>
          <button className="press text-red-400" onClick={async () => { if (confirm(`Delete playlist “${pl.name}”? Songs stay in your library.`)) { await deletePlaylist(pl.id); nav('/library/playlists', { replace: true }); } }}>Delete</button>
        </div>
      </Hero>
      {renaming && (
        <form className="mb-3 flex gap-2 px-gutter" onSubmit={async (e) => { e.preventDefault(); await renamePlaylist(pl.id, name); setRenaming(false); }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Playlist name" className="min-w-0 flex-1 rounded-full bg-s2 px-4 py-3 outline-none focus:ring-2 focus:ring-accent" />
          <button className="press rounded-full bg-accent px-5 font-semibold text-black">Save</button>
        </form>
      )}
      {!list.length ? <p className="px-gutter py-10 text-center text-fg-3">Empty. Use a song’s ••• menu → Add to playlist.</p> : list.map((t, i) => (
        <TrackRow key={t.id} track={t} onPlay={() => void p.playQueue(ids, i)}
          trailing={<button className="press tap text-fg-3" aria-label={`Remove ${t.title} from playlist`} onClick={() => { void removeFromPlaylist(pl.id, t.id); ui.toast('Removed from playlist'); }}><TrashIcon size={18} /></button>} />
      ))}
    </div>
  );
}
