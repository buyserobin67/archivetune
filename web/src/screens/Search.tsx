import { useDeferredValue, useMemo, useState } from 'react';
import { GroupCard, GroupGrid, Section, Shelf } from '../components/Cards';
import { TrackRow } from '../components/TrackRow';
import { groupAlbums, groupArtists, matchesQuery } from '../lib/library';
import { getPlayer } from '../lib/player';
import { useTracks } from '../lib/hooks';
import { ScreenHeader, SearchField } from './common';

export default function Search() {
  const tracks = useTracks();
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const hits = useMemo(() => (tracks ?? []).filter((t) => matchesQuery(t, dq)), [tracks, dq]);
  const p = getPlayer();
  const ids = hits.map((t) => t.id);
  const searching = dq.trim().length > 0;
  const artists = useMemo(() => groupArtists(searching ? hits : tracks ?? []), [hits, tracks, searching]);
  const albums = useMemo(() => groupAlbums(searching ? hits : tracks ?? []), [hits, tracks, searching]);
  return (
    <div className="page-enter">
      <ScreenHeader title="Search" />
      <div className="px-gutter pb-4"><SearchField value={q} onChange={setQ} placeholder="Songs, artists, albums" /></div>
      {!searching && (tracks?.length ?? 0) > 0 && (
        <>
          <Section title="Browse artists" to="/library/artists"><Shelf>{artists.slice(0, 12).map((g) => <GroupCard key={g.key} group={g} base="/library/artists" round />)}</Shelf></Section>
          <Section title="Browse albums" to="/library/albums"><Shelf>{albums.slice(0, 12).map((g) => <GroupCard key={g.key} group={g} base="/library/albums" />)}</Shelf></Section>
        </>
      )}
      {!searching && (tracks?.length ?? 0) === 0 && <p className="px-gutter py-10 text-center text-fg-3">Import some music to search it here.</p>}
      {searching && hits.length === 0 && <p className="px-gutter py-10 text-center text-fg-3">No matches for “{dq}”.</p>}
      {searching && hits.length > 0 && (
        <>
          {artists.length <= 8 && <Section title="Artists"><GroupGrid groups={artists.slice(0, 4)} base="/library/artists" round /></Section>}
          {albums.length > 0 && <Section title="Albums"><GroupGrid groups={albums.slice(0, 4)} base="/library/albums" /></Section>}
          <Section title="Songs">
            {hits.map((t, i) => <TrackRow key={t.id} track={t} onPlay={() => void p.playQueue(ids, i)} />)}
          </Section>
        </>
      )}
    </div>
  );
}
