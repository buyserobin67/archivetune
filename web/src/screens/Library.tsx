import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Art } from '../components/Art';
import { PlayIcon, PlusIcon, ShuffleIcon, TrashIcon } from '../components/Icons';
import { ImportButton } from '../components/ImportButton';
import { TrackRow } from '../components/TrackRow';
import { groupAlbums, groupArtists } from '../lib/library';
import { getPlayer } from '../lib/player';
import { createPlaylist, deletePlaylist, removeFromPlaylist, renamePlaylist } from '../lib/playlists';
import { usePlaylists, useTracks } from '../lib/hooks';
import { ui } from '../lib/ui';
import type { Track } from '../lib/types';
import { EmptyState, GroupGrid, Page } from './common';

const TABS = [
  ['songs', 'Songs'], ['albums', 'Albums'], ['artists', 'Artists'], ['playlists', 'Playlists'], ['favorites', 'Favorites'],
] as const;

function Tabs({ active }: { active: string }) {
  return (
    <div className="hide-scroll -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
      {TABS.map(([k, label]) => (
        <Link key={k} to={`/library/${k}`} className={`press shrink-0 rounded-full px-4 py-2 text-sm font-medium ${active === k ? 'bg-violet-600 text-white' : 'bg-white/10 text-white/70'}`}>{label}</Link>
      ))}
    </div>
  );
}

function PlayBar({ ids }: { ids: string[] }) {
  const p = getPlayer();
  if (!ids.length) return null;
  return (
    <div className="mb-3 flex gap-3">
      <button className="press flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-3 font-semibold text-black" onClick={() => void p.playQueue(ids, 0)}><PlayIcon size={18} /> Play</button>
      <button className="press flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 font-semibold" onClick={() => { p.setShuffle(true); void p.playQueue(ids, Math.floor(Math.random() * ids.length)); }}><ShuffleIcon size={18} /> Shuffle</button>
    </div>
  );
}

function SongList({ tracks }: { tracks: Track[] }) {
  const p = getPlayer();
  const ids = tracks.map((t) => t.id);
  return (
    <>
      <PlayBar ids={ids} />
      {tracks.map((t, i) => <TrackRow key={t.id} track={t} onPlay={() => void p.playQueue(ids, i)} />)}
    </>
  );
}

export default function Library() {
  const { tab = 'songs' } = useParams();
  const tracks = useTracks();
  if (!TABS.some(([k]) => k === tab)) return <Navigate to="/library/songs" replace />;
  if (!tracks) return <Page title="Library"><div /></Page>;
  return (
    <Page title="Library" action={<ImportButton label="Import" className="!px-4 !py-2 text-sm" />}>
      <Tabs active={tab} />
      {tab === 'playlists' ? <PlaylistsTab /> : tracks.length === 0 ? (
        <EmptyState title="Nothing here yet" body="Import songs from Files to build your library." />
      ) : tab === 'songs' ? <SongList tracks={tracks} />
        : tab === 'albums' ? <GroupGrid groups={groupAlbums(tracks)} base="/library/albums" />
        : tab === 'artists' ? <GroupGrid groups={groupArtists(tracks)} base="/library/artists" />
        : <FavoritesTab tracks={tracks} />}
    </Page>
  );
}

function FavoritesTab({ tracks }: { tracks: Track[] }) {
  const favs = tracks.filter((t) => t.favorite);
  if (!favs.length) return <EmptyState showImport={false} title="No favorites yet" body="Tap the heart in the player, or use a song's ••• menu." />;
  return <SongList tracks={favs} />;
}

function PlaylistsTab() {
  const lists = usePlaylists();
  const [name, setName] = useState('');
  return (
    <>
      <form className="mb-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await createPlaylist(name); setName(''); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist" className="min-w-0 flex-1 rounded-xl bg-white/10 px-4 py-3 text-[16px] outline-none placeholder:text-white/35 focus:ring-2 focus:ring-violet-500" />
        <button className="press flex items-center gap-1 rounded-xl bg-violet-600 px-4 font-medium"><PlusIcon size={18} /> Add</button>
      </form>
      {!lists?.length && <p className="py-8 text-center text-white/40">No playlists yet.</p>}
      {(lists ?? []).map((p) => (
        <Link key={p.id} to={`/library/playlists/${p.id}`} className="press flex items-center gap-3 py-2">
          <Art trackId={undefined} seed={p.name} className="h-14 w-14" />
          <div className="min-w-0"><div className="truncate font-semibold">{p.name}</div><div className="text-sm text-white/50">{p.trackIds.length} song{p.trackIds.length === 1 ? '' : 's'}</div></div>
        </Link>
      ))}
    </>
  );
}

/** Albums and artists share one detail screen. */
export function GroupDetail({ kind }: { kind: 'albums' | 'artists' }) {
  const { key = '' } = useParams();
  const tracks = useTracks();
  const decoded = decodeURIComponent(key);
  if (!tracks) return null;
  const groups = kind === 'albums' ? groupAlbums(tracks) : groupArtists(tracks);
  const g = groups.find((x) => x.key === decoded);
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const list = (g?.trackIds ?? []).map((id) => byId.get(id)!).filter(Boolean);
  return (
    <Page title={g?.name ?? 'Not found'} back={`/library/${kind}`}>
      {g ? (
        <>
          <div className="mb-4 flex items-center gap-4">
            <Art trackId={g.artTrackId} seed={g.name} className="w-32" rounded="rounded-2xl" />
            <div className="text-white/60">{g.subtitle}<br />{list.length} song{list.length === 1 ? '' : 's'}</div>
          </div>
          <SongList tracks={list} />
        </>
      ) : <p className="py-10 text-center text-white/40">That {kind === 'albums' ? 'album' : 'artist'} is no longer in your library.</p>}
    </Page>
  );
}

export function PlaylistDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const pl = useLiveQuery(() => db.playlists.get(id), [id]);
  const tracks = useTracks();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  if (!pl || !tracks) return <Page title="Playlist" back="/library/playlists"><div /></Page>;
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const list = pl.trackIds.map((t) => byId.get(t)).filter((t): t is Track => !!t);
  const ids = list.map((t) => t.id);
  const p = getPlayer();
  return (
    <Page title={pl.name} back="/library/playlists">
      <div className="mb-3 flex gap-4 text-sm">
        <button className="press text-violet-300" onClick={() => { setName(pl.name); setRenaming(true); }}>Rename</button>
        <button className="press text-red-400" onClick={async () => { if (confirm(`Delete playlist “${pl.name}”? Songs stay in your library.`)) { await deletePlaylist(pl.id); nav('/library/playlists', { replace: true }); } }}>Delete playlist</button>
      </div>
      {renaming && (
        <form className="mb-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); await renamePlaylist(pl.id, name); setRenaming(false); }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-xl bg-white/10 px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-violet-500" />
          <button className="press rounded-xl bg-violet-600 px-4 font-medium">Save</button>
        </form>
      )}
      {!list.length ? <p className="py-10 text-center text-white/40">Empty. Use a song's ••• menu → Add to playlist.</p> : (
        <>
          <PlayBar ids={ids} />
          {list.map((t, i) => (
            <TrackRow key={t.id} track={t} onPlay={() => void p.playQueue(ids, i)}
              trailing={<button className="press p-2 text-white/40" aria-label="Remove from playlist" onClick={() => { void removeFromPlaylist(pl.id, t.id); ui.toast('Removed from playlist'); }}><TrashIcon size={18} /></button>} />
          ))}
        </>
      )}
    </Page>
  );
}

