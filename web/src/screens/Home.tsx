import { Link } from 'react-router-dom';
import { Art } from '../components/Art';
import { PlayIcon, ShuffleIcon } from '../components/Icons';
import { ImportButton } from '../components/ImportButton';
import { TrackRow } from '../components/TrackRow';
import { getPlayer } from '../lib/player';
import { useTracks } from '../lib/hooks';
import type { Track } from '../lib/types';
import { EmptyState, Page } from './common';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const tracks = useTracks();
  if (!tracks) return <Page title="Cadence"><div /></Page>;
  if (!tracks.length) {
    return (
      <Page title="Cadence">
        <EmptyState title="Your library is empty" body="Import songs from the Files app. They're stored on this device only and play offline." />
      </Page>
    );
  }
  const recent = tracks.filter((t) => t.lastPlayedAt).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt).slice(0, 12);
  const added = [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
  const p = getPlayer();
  const ids = tracks.map((t) => t.id);
  return (
    <div className="violet-glow">
      <Page title={greeting()} action={<ImportButton label="Import" className="!px-4 !py-2 text-sm" />}>
        <div className="mb-6 flex gap-3">
          <button className="press flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-3.5 font-semibold text-black" onClick={() => void p.playQueue(ids, 0)}>
            <PlayIcon size={20} /> Play all
          </button>
          <button className="press flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 py-3.5 font-semibold" onClick={() => { p.setShuffle(true); void p.playQueue(ids, Math.floor(Math.random() * ids.length)); }}>
            <ShuffleIcon size={20} /> Shuffle
          </button>
        </div>
        <Shelf title="Recently played" tracks={recent} empty="Songs you play show up here." all={ids} />
        <Shelf title="Recently added" tracks={added} all={ids} />
        <div className="pb-4 pt-2">
          <Link to="/library/favorites" className="press block rounded-2xl bg-gradient-to-r from-violet-800/60 to-ink-700 px-5 py-4 font-semibold">♥ Favorites</Link>
        </div>
        <h2 className="pb-1 pt-4 text-xl font-bold">All songs</h2>
        {tracks.slice(0, 8).map((t, i) => <TrackRow key={t.id} track={t} onPlay={() => void p.playQueue(ids, i)} />)}
        {tracks.length > 8 && <Link to="/library/songs" className="block py-3 text-center text-violet-300">See all {tracks.length}</Link>}
      </Page>
    </div>
  );
}

function Shelf({ title, tracks, all, empty }: { title: string; tracks: Track[]; all: string[]; empty?: string }) {
  const p = getPlayer();
  return (
    <section className="mb-5">
      <h2 className="mb-3 text-xl font-bold">{title}</h2>
      {tracks.length === 0 ? (
        <p className="text-sm text-white/40">{empty}</p>
      ) : (
        <div className="hide-scroll -mx-4 flex gap-4 overflow-x-auto px-4">
          {tracks.map((t) => (
            <button key={t.id} className="press w-36 shrink-0 text-left" onClick={() => void p.playQueue(all, all.indexOf(t.id))}>
              <Art trackId={t.hasArt ? t.id : undefined} seed={t.album} className="w-36" rounded="rounded-2xl" />
              <div className="mt-2 truncate text-sm font-semibold">{t.title}</div>
              <div className="truncate text-xs text-white/50">{t.artist}</div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
