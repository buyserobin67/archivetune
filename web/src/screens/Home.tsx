import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CadenceMark, ChevronRight, SettingsIcon, ShuffleIcon, PlayIcon } from '../components/Icons';
import { ExamplePreview, GroupCard, ListenRow, QuickPickCard, Section, Shelf, TrackCard } from '../components/Cards';
import { ShelfSkeleton } from '../components/Skeletons';
import { ImportButton } from '../components/ImportButton';
import { groupAlbums } from '../lib/library';
import { availableMoods, quickPicks, tracksForMood, type MoodId } from '../lib/moods';
import { getPlayer } from '../lib/player';
import { useTracks } from '../lib/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { computeRecap, formatListening } from '../lib/stats';
import { Chip, RoundButton } from './common';

export default function Home() {
  const tracks = useTracks();
  const nav = useNavigate();
  const p = getPlayer();
  const [mood, setMood] = useState<MoodId | null>(null);
  const week = useLiveQuery(() => db.plays.where('at').aboveOrEqual(Date.now() - 8 * 86_400_000).toArray(), []);
  const weekRecap = useMemo(() => computeRecap(week ?? [], 'week'), [week]);

  const data = useMemo(() => {
    const all = tracks ?? [];
    const recent = all.filter((t) => t.lastPlayedAt).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
    const recentAlbumKeys = new Set(recent.map((t) => `${t.album}\u0000${t.artist}`));
    const albums = groupAlbums(all);
    const moods = availableMoods(all);
    return {
      all,
      ids: all.map((t) => t.id),
      picks: quickPicks(all, 10),
      moods,
      listening: recent.slice(0, 4),
      recentAlbums: albums.filter((g) => recentAlbumKeys.has(g.key)).slice(0, 12),
      favorites: all.filter((t) => t.favorite === 1).slice(0, 12),
      albums: albums.slice(0, 12),
    };
  }, [tracks]);

  const activeMood = data.moods.find((m) => m.id === mood) ?? null;
  const picks = activeMood ? tracksForMood(data.all, activeMood.id).slice(0, 12) : data.picks;
  const playFromAll = (id: string) => void p.playQueue(data.ids, data.ids.indexOf(id));
  const playList = (list: { id: string }[], i: number) => void p.playQueue(list.map((t) => t.id), i);
  const shuffleAll = () => { p.setShuffle(true); void p.playQueue(data.ids, Math.floor(Math.random() * data.ids.length)); };

  return (
    <div className="page-enter">
      <header className="flex items-center justify-between gap-3 px-gutter pb-3" style={{ paddingTop: 'calc(var(--sat) + 0.5rem)' }}>
        <Link to="/" className="flex min-w-0 items-center gap-2" aria-label="Cadence home">
          <CadenceMark size={26} className="shrink-0 text-fg" />
          <span className="truncate text-title font-bold tracking-tight">Cadence</span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {!!tracks?.length && <RoundButton label="Shuffle all songs" onClick={shuffleAll}><ShuffleIcon size={16} /></RoundButton>}
          <ImportButton variant="icon" label="Import music" />
          <RoundButton label="Settings" onClick={() => nav('/settings')}><SettingsIcon size={18} /></RoundButton>
        </div>
      </header>

      {!tracks && <ShelfSkeleton />}

      {tracks && tracks.length === 0 && <Welcome />}

      {data.moods.length > 0 && (
        <div className="row-scroll hide-scroll gap-2 px-gutter pb-4" role="group" aria-label="Moods">
          {data.moods.map((m) => (
            <Chip key={m.id} active={mood === m.id} onClick={() => setMood(mood === m.id ? null : m.id)} label={`${m.label}: ${m.why}`}>{m.label}</Chip>
          ))}
        </div>
      )}

      {!!tracks?.length && (
        <Link to="/recap" className="press mx-gutter mb-6 flex items-center justify-between rounded-xl bg-s1 p-4" aria-label="Open your listening recap">
          <span className="min-w-0">
            <span className="block text-caption uppercase tracking-wider text-fg-3">{weekRecap.plays ? 'Your week' : 'Recap'}</span>
            <span className="mt-0.5 block truncate text-title font-bold">{weekRecap.plays ? formatListening(weekRecap.seconds) : 'Your recap'}</span>
            <span className="block truncate text-footnote text-fg-2">{weekRecap.plays ? `${weekRecap.plays} plays · ${weekRecap.topArtists[0]?.name ?? ''}` : 'Day, week, month and year, on this device'}</span>
          </span>
          <ChevronRight size={20} className="shrink-0 text-fg-3" />
        </Link>
      )}

      {picks.length > 0 && (
        <Section
          title={activeMood ? `${activeMood.label} picks` : 'Quick Picks'}
          action={activeMood && (
            <button className="press flex h-8 items-center gap-1 rounded-full bg-s2 px-3 text-footnote font-semibold" onClick={() => playList(picks, 0)}><PlayIcon size={14} /> Play</button>
          )}
        >
          <Shelf>{picks.map((t, i) => <QuickPickCard key={t.id} track={t} onPlay={() => (activeMood ? playList(picks, i) : playFromAll(t.id))} />)}</Shelf>
        </Section>
      )}

      {data.listening.length > 0 && (
        <Section title="Keep listening">
          <div>{data.listening.map((t) => <ListenRow key={t.id} track={t} onPlay={() => playFromAll(t.id)} />)}</div>
        </Section>
      )}

      {data.recentAlbums.length > 0 && (
        <Section title="Recently played" to="/library/albums">
          <Shelf>{data.recentAlbums.map((g) => <GroupCard key={g.key} group={g} base="/library/albums" />)}</Shelf>
        </Section>
      )}

      {data.favorites.length > 0 && (
        <Section title="Favorites" to="/library/favorites">
          <Shelf>{data.favorites.map((t) => <TrackCard key={t.id} track={t} onPlay={() => playFromAll(t.id)} />)}</Shelf>
        </Section>
      )}

      {data.albums.length > 0 && (
        <Section title="Albums" to="/library/albums">
          <Shelf>{data.albums.map((g) => <GroupCard key={g.key} group={g} base="/library/albums" />)}</Shelf>
        </Section>
      )}

      {tracks && tracks.length === 0 && <ExamplePreview />}
    </div>
  );
}

/** Compact welcome card for an empty library. */
function Welcome() {
  return (
    <section className="mx-gutter mb-6 rounded-xl bg-s2 p-4" aria-labelledby="welcome-title">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-s3"><CadenceMark size={26} /></div>
        <div className="min-w-0">
          <h1 id="welcome-title" className="text-body-lg font-semibold">Welcome to Cadence</h1>
          <p className="text-footnote text-fg-2">Your music, on your iPhone. Plays offline.</p>
        </div>
      </div>
      <p className="mt-3 text-footnote text-fg-2">Import songs from the Files app. They stay on this device and are never uploaded.</p>
      <ImportButton variant="compact" label="Import music" className="mt-3 w-full" />
    </section>
  );
}
