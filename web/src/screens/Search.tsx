import { useDeferredValue, useMemo, useState } from 'react';
import { SearchIcon } from '../components/Icons';
import { TrackRow } from '../components/TrackRow';
import { groupAlbums, groupArtists, matchesQuery } from '../lib/library';
import { getPlayer } from '../lib/player';
import { useTracks } from '../lib/hooks';
import { GroupGrid, Page } from './common';

export default function Search() {
  const tracks = useTracks();
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const hits = useMemo(() => (tracks ?? []).filter((t) => matchesQuery(t, dq)), [tracks, dq]);
  const p = getPlayer();
  const ids = hits.map((t) => t.id);
  const searching = dq.trim().length > 0;
  return (
    <Page title="Search">
      <div className="glass sticky z-10 mb-4 flex items-center gap-2 rounded-2xl border border-white/10 px-4" style={{ top: 'calc(var(--sat) + 4px)' }}>
        <SearchIcon size={20} className="text-white/50" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Songs, artists, albums"
          type="search" enterKeyHint="search" autoCapitalize="none" autoCorrect="off"
          className="w-full bg-transparent py-3.5 text-[17px] outline-none placeholder:text-white/35"
        />
      </div>
      {!searching && <p className="py-10 text-center text-white/40">Searches your whole library, on this device.</p>}
      {searching && hits.length === 0 && <p className="py-10 text-center text-white/40">No matches for “{dq}”.</p>}
      {searching && hits.length > 0 && (
        <>
          {groupArtists(hits).length > 0 && groupArtists(hits).length <= 6 && (
            <section className="mb-2"><h2 className="mb-2 text-lg font-bold">Artists</h2><GroupGrid groups={groupArtists(hits).slice(0, 4)} base="/library/artists" /></section>
          )}
          {groupAlbums(hits).length > 0 && (
            <section className="mb-2"><h2 className="mb-2 text-lg font-bold">Albums</h2><GroupGrid groups={groupAlbums(hits).slice(0, 4)} base="/library/albums" /></section>
          )}
          <h2 className="mb-1 text-lg font-bold">Songs</h2>
          {hits.map((t, i) => <TrackRow key={t.id} track={t} onPlay={() => void p.playQueue(ids, i)} />)}
        </>
      )}
    </Page>
  );
}
