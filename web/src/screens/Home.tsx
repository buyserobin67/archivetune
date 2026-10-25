import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { GroupCard, Section, Shelf, TrackCard } from '../components/Cards';
import { ShuffleIcon } from '../components/Icons';
import { ImportButton } from '../components/ImportButton';
import { TrackRow } from '../components/TrackRow';
import { groupAlbums } from '../lib/library';
import { getPlayer } from '../lib/player';
import { useTracks } from '../lib/hooks';
import { EmptyState, RoundButton, ScreenHeader } from './common';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const tracks = useTracks();
  const greet = useMemo(greeting, []);
  const p = getPlayer();

  const data = useMemo(() => {
    const all = tracks ?? [];
    const ids = all.map((t) => t.id);
    return {
      ids,
      recent: all.filter((t) => t.lastPlayedAt).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt).slice(0, 12),
      favorites: all.filter((t) => t.favorite === 1).slice(0, 12),
      albums: groupAlbums(all).slice(0, 12),
      added: [...all].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6),
    };
  }, [tracks]);

  if (!tracks) return <ScreenHeader title={greet} />;
  if (!tracks.length) {
    return (
      <div>
        <ScreenHeader title="Cadence" eyebrow={greet} />
        <EmptyState title="Your library is empty" body="Import songs from the Files app. They stay on this device and play offline." />
      </div>
    );
  }
  const playFrom = (i: number) => void p.playQueue(data.ids, i);
  const shuffleAll = () => { p.setShuffle(true); void p.playQueue(data.ids, Math.floor(Math.random() * data.ids.length)); };
  return (
    <div className="page-enter">
      <ScreenHeader
        title={greet}
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        actions={<><RoundButton label="Shuffle all songs" onClick={shuffleAll}><ShuffleIcon size={18} /></RoundButton><ImportButton variant="icon" label="Import music" /></>}
      />

      {data.recent.length > 0 && (
        <Section title="Jump back in">
          <Shelf>{data.recent.map((t) => <TrackCard key={t.id} track={t} onPlay={() => playFrom(data.ids.indexOf(t.id))} />)}</Shelf>
        </Section>
      )}
      {data.favorites.length > 0 && (
        <Section title="Favorites" to="/library/favorites">
          <Shelf>{data.favorites.map((t) => <TrackCard key={t.id} track={t} onPlay={() => playFrom(data.ids.indexOf(t.id))} />)}</Shelf>
        </Section>
      )}
      <Section title="Albums" to="/library/albums">
        <Shelf>{data.albums.map((g) => <GroupCard key={g.key} group={g} base="/library/albums" />)}</Shelf>
      </Section>
      <Section title="Recently added" to="/library/songs">
        <div>{data.added.map((t) => <TrackRow key={t.id} track={t} onPlay={() => playFrom(data.ids.indexOf(t.id))} />)}</div>
        {tracks.length > data.added.length && (
          <Link to="/library/songs" className="press mt-1 block px-gutter py-2 text-footnote font-semibold text-accent-text">See all {tracks.length} songs</Link>
        )}
      </Section>
    </div>
  );
}
