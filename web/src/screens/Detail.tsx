import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Art, FallbackCover } from '../components/Art';
import { PlayIcon, ShuffleIcon, TrashIcon } from '../components/Icons';
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
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[30rem]" aria-hidden="true"
        style={{ background: `radial-gradient(110% 70% at 50% 0%, rgb(${rgbCss(palette.accent)} / .5), transparent 72%), linear-gradient(to bottom, rgb(${rgbCss(palette.tint)} / .5), transparent 85%)` }} />
      <BackBar to={back} />
      <div className="relative flex flex-col items-center px-gutter pb-5 pt-3 text-center">
        <div className={`aspect-square w-[min(12rem,55vw)] overflow-hidden shadow-art ${round ? 'rounded-full' : 'rounded-xl'}`}>
          {collage ? <Collage tracks={collage} seed={seed} /> : <Art trackId={trackId} seed={seed} className="h-full w-full" rounded="rounded-none" priority />}
        </div>
        <h1 className="mt-4 line-clamp-2 max-w-full text-title-lg font-extrabold">{title}</h1>
        <div className="mt-0.5 text-footnote text-fg-2">{meta}</div>
        {children}
      </div>
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
      <button className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 font-semibold ring-1 ring-white/10" onClick={() => { p.setShuffle(true); void p.playQueue(ids, Math.floor(Math.random() * ids.length)); }}><ShuffleIcon size={18} /> Shuffle</button>
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
  return (
    <div className="page-enter">
      <Hero back={`/library/${kind}`} trackId={g.artTrackId} seed={g.name} title={g.name} round={kind === 'artists'}
        meta={`${kind === 'albums' ? g.subtitle + ' · ' : ''}${list.length} song${list.length === 1 ? '' : 's'} · ${formatTime(total)}`}>
        <Actions ids={ids} />
      </Hero>
      {list.map((t, i) => <TrackRow key={t.id} track={t} index={kind === 'albums' ? i : undefined} onPlay={() => void p.playQueue(ids, i)} />)}
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
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Playlist name" className="min-w-0 flex-1 rounded-full bg-s2 px-4 py-3 outline-none ring-1 ring-line focus:ring-2 focus:ring-accent" />
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
