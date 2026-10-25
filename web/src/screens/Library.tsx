import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Art } from '../components/Art';
import { GroupGrid } from '../components/Cards';
import { DownloadIcon, PlayIcon, PlusIcon, ShuffleIcon, SortIcon, HeartIcon } from '../components/Icons';
import { ImportButton } from '../components/ImportButton';
import { LicensedDownloads } from '../components/LicensedDownloads';
import { OptionSheet, Sheet } from '../components/Sheets';
import { TrackRow } from '../components/TrackRow';
import { groupAlbums, groupArtists, matchesQuery } from '../lib/library';
import { getPlayer } from '../lib/player';
import { createPlaylist } from '../lib/playlists';
import { usePlaylists, usePref, useTracks } from '../lib/hooks';
import { filterTracks, GROUP_SORTS, SONG_SORTS, sortGroups, sortTracks, type GroupSort, type SongSort } from '../lib/sort';
import { ui } from '../lib/ui';
import type { Track } from '../lib/types';
import { Chip, EmptyState, RoundButton, ScreenHeader, SearchField } from './common';

const TABS = [['songs', 'Songs'], ['albums', 'Albums'], ['artists', 'Artists'], ['playlists', 'Playlists'], ['downloads', 'Downloads']] as const;
const VALID = new Set<string>([...TABS.map(([k]) => k), 'favorites']);

export default function Library() {
  const { tab = 'songs' } = useParams();
  const tracks = useTracks();
  const [query, setQuery] = useState('');
  const [songSort, setSongSort] = usePref<SongSort>('songSort', 'title');
  const [groupSort, setGroupSort] = usePref<GroupSort>('groupSort', 'name');
  const [sheet, setSheet] = useState<'sort' | 'add' | null>(null);
  const p = getPlayer();

  const favoritesOnly = tab === 'favorites';
  const songs = useMemo(
    () => sortTracks(filterTracks(tracks ?? [], { query, favoritesOnly }, matchesQuery), songSort),
    [tracks, query, favoritesOnly, songSort],
  );
  const downloads = useMemo(() => sortTracks(filterTracks((tracks ?? []).filter((t) => t.license), { query, favoritesOnly: false }, matchesQuery), songSort), [tracks, query, songSort]);
  const albums = useMemo(() => sortGroups(groupAlbums(filterTracks(tracks ?? [], { query, favoritesOnly: false }, matchesQuery)), groupSort), [tracks, query, groupSort]);
  const artists = useMemo(() => sortGroups(groupArtists(filterTracks(tracks ?? [], { query, favoritesOnly: false }, matchesQuery)), groupSort), [tracks, query, groupSort]);

  if (!VALID.has(tab)) return <Navigate to="/library/songs" replace />;
  if (!tracks) return <ScreenHeader title="Library" />;

  const isSongs = tab === 'songs' || tab === 'favorites' || tab === 'downloads';
  const list = tab === 'downloads' ? downloads : songs;
  const ids = list.map((t) => t.id);
  const sortLabel = isSongs ? SONG_SORTS.find(([k]) => k === songSort)![1] : GROUP_SORTS.find(([k]) => k === groupSort)![1];
  const shown = tab === 'albums' ? albums.length : tab === 'artists' ? artists.length : list.length;
  const unit = tab === 'albums' ? 'album' : tab === 'artists' ? 'artist' : 'song';

  return (
    <div className="page-enter">
      <ScreenHeader title="Library" eyebrow={tracks.length ? `${shown} ${unit}${shown === 1 ? '' : 's'}` : undefined} actions={<ImportButton variant="icon" label="Import music" />} />

      {tab !== 'playlists' && <div className="px-gutter pb-3"><SearchField value={query} onChange={setQuery} placeholder={`Search ${tab === 'favorites' ? 'favorites' : tab}`} /></div>}

      <div className="row-scroll hide-scroll gap-2 px-gutter pb-3" role="tablist" aria-label="Library sections">
        {TABS.map(([k, label]) => <Chip key={k} to={`/library/${k}`} active={tab === k || (k === 'songs' && tab === 'favorites')}>{label}</Chip>)}
      </div>

      {tab !== 'playlists' && tracks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-gutter pb-2">
          <Chip onClick={() => setSheet('sort')} label={`Sort by ${sortLabel}`}><SortIcon size={15} />{sortLabel}</Chip>
          {(tab === 'songs' || tab === 'favorites') && (
            <Link to={favoritesOnly ? '/library/songs' : '/library/favorites'} replace className={`press inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-footnote font-semibold ${favoritesOnly ? 'bg-accent text-black' : 'bg-s2 text-fg-2 ring-1 ring-line'}`} aria-pressed={favoritesOnly}>
              <HeartIcon size={14} filled={favoritesOnly} />Favorites
            </Link>
          )}
          <div className="ml-auto flex items-center gap-2">
            {isSongs && ids.length > 0 && (
              <>
                <RoundButton label="Play" tone="accent" onClick={() => void p.playQueue(ids, 0)}><PlayIcon size={18} /></RoundButton>
                <RoundButton label="Shuffle" onClick={() => { p.setShuffle(true); void p.playQueue(ids, Math.floor(Math.random() * ids.length)); }}><ShuffleIcon size={18} /></RoundButton>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'playlists' ? <PlaylistsTab /> : tracks.length === 0 ? (
        <EmptyState title="Nothing here yet" body="Import songs from Files to build your library." />
      ) : tab === 'downloads' ? (
        <DownloadsTab list={list} onAdd={() => setSheet('add')} onPlay={(i) => void p.playQueue(ids, i)} />
      ) : isSongs ? (
        <SongList list={list} ids={ids} favoritesOnly={favoritesOnly} query={query} />
      ) : tab === 'albums' ? (
        albums.length ? <GroupGrid groups={albums} base="/library/albums" /> : <NoMatches query={query} />
      ) : artists.length ? <GroupGrid groups={artists} base="/library/artists" round /> : <NoMatches query={query} />}

      {sheet === 'sort' && (isSongs
        ? <OptionSheet title="Sort by" options={SONG_SORTS} value={songSort} onPick={setSongSort} onClose={() => setSheet(null)} />
        : <OptionSheet title="Sort by" options={GROUP_SORTS} value={groupSort} onPick={setGroupSort} onClose={() => setSheet(null)} />)}
      {sheet === 'add' && <Sheet title="Add licensed music" tall onClose={() => setSheet(null)}><LicensedDownloads /></Sheet>}
    </div>
  );
}

const NoMatches = ({ query }: { query: string }) => <p className="px-gutter py-12 text-center text-fg-3">{query ? `No matches for “${query}”.` : 'Nothing here yet.'}</p>;

function SongList({ list, ids, favoritesOnly, query }: { list: Track[]; ids: string[]; favoritesOnly: boolean; query: string }) {
  const p = getPlayer();
  if (!list.length) {
    return favoritesOnly && !query
      ? <EmptyState showImport={false} title="No favorites yet" body="Tap the heart in the player, or use a song’s ••• menu." />
      : <NoMatches query={query} />;
  }
  return <div>{list.map((t, i) => <TrackRow key={t.id} track={t} onPlay={() => void p.playQueue(ids, i)} />)}</div>;
}

function DownloadsTab({ list, onAdd, onPlay }: { list: Track[]; onAdd: () => void; onPlay: (i: number) => void }) {
  return (
    <>
      <div className="mx-gutter mb-3 flex items-center gap-3 rounded-lg bg-s2 p-3 ring-1 ring-line">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent-text"><DownloadIcon size={20} /></div>
        <p className="min-w-0 flex-1 text-footnote text-fg-2">Music from sources that permit downloading, with license and credit kept.</p>
        <button className="press h-9 shrink-0 rounded-full bg-fg px-4 text-footnote font-semibold text-black" onClick={onAdd}>Add</button>
      </div>
      {list.length === 0 ? (
        <p className="px-gutter py-10 text-center text-fg-3">No licensed downloads yet.</p>
      ) : list.map((t, i) => (
        <TrackRow key={t.id} track={t} onPlay={() => onPlay(i)} trailing={<span className="max-w-[5.5rem] truncate text-caption text-fg-3">{t.license?.name}</span>} />
      ))}
    </>
  );
}

function PlaylistsTab() {
  const lists = usePlaylists();
  const tracks = useTracks();
  const [name, setName] = useState('');
  const byId = useMemo(() => new Map((tracks ?? []).map((t) => [t.id, t])), [tracks]);
  return (
    <>
      <form className="mb-4 flex gap-2 px-gutter" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await createPlaylist(name); setName(''); ui.toast('Playlist created'); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist" aria-label="New playlist name" className="h-11 min-w-0 flex-1 rounded-full bg-s2 px-4 outline-none ring-1 ring-line placeholder:text-fg-3 focus:ring-2 focus:ring-accent" />
        <button className="press flex h-11 items-center gap-1 rounded-full bg-accent px-5 font-semibold text-black"><PlusIcon size={18} /> Add</button>
      </form>
      {!lists?.length && <p className="px-gutter py-10 text-center text-fg-3">No playlists yet.</p>}
      {(lists ?? []).map((pl) => {
        const first = pl.trackIds.map((id) => byId.get(id)).find((t) => t?.hasArt);
        return (
          <Link key={pl.id} to={`/library/playlists/${pl.id}`} className="press flex items-center gap-3 px-gutter py-2">
            <Art trackId={first?.id} seed={pl.name} className="h-14 w-14" rounded="rounded-md" />
            <div className="min-w-0"><div className="truncate text-body-lg font-medium">{pl.name}</div><div className="text-footnote text-fg-2">{pl.trackIds.length} song{pl.trackIds.length === 1 ? '' : 's'}</div></div>
          </Link>
        );
      })}
    </>
  );
}
