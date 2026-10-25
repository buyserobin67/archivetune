import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Art } from '../components/Art';
import { ChevronLeft, ChevronRight } from '../components/Icons';
import { StatsSaver } from '../components/StatsSaver';
import { db } from '../lib/db';
import { getPlayer } from '../lib/player';
import { computeRecap, currentStreak, formatListening, rangeFor, type Period, type Ranked } from '../lib/stats';
import { ScreenHeader } from './common';

const PERIODS: [Period, string][] = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']];
const NOUN: Record<Period, string> = { day: 'today', week: 'this week', month: 'this month', year: 'this year' };

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-title font-bold tabular-nums">{value}</div>
      <div className="truncate text-caption text-fg-3">{label}</div>
    </div>
  );
}

function RankList({ title, rows, kind }: { title: string; rows: Ranked[]; kind: 'track' | 'artist' | 'album' }) {
  if (!rows.length) return null;
  const top = rows[0].plays;
  return (
    <section className="mb-7 px-gutter" aria-label={title}>
      <h2 className="mb-2 text-title font-bold">{title}</h2>
      <ol className="space-y-1">
        {rows.map((r, i) => (
          <li key={r.key}>
            <button
              className="press flex w-full items-center gap-3 rounded-lg py-1.5 text-left"
              onClick={() => { void db.tracks.toArray().then((all) => { const t = all.find((x) => x.id === r.trackId) ?? all.find((x) => x.title === r.name && (kind !== 'track' || x.artist === r.sub)); if (t) void getPlayer().playQueue([t.id], 0); }); }}
            >
              <span className="w-5 shrink-0 text-center text-footnote font-semibold tabular-nums text-fg-3">{i + 1}</span>
              <Art trackId={r.trackId} seed={r.name} className="h-12 w-12" rounded={kind === 'artist' ? 'rounded-full' : 'rounded-md'} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium">{r.name}</span>
                <span className="block truncate text-footnote text-fg-2">{r.sub ? `${r.sub} · ` : ''}{r.plays} {r.plays === 1 ? 'play' : 'plays'} · {formatListening(r.seconds)}</span>
                <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-fg/70" style={{ width: `${Math.max(6, (r.plays / top) * 100)}%` }} /></span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Recap() {
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const now = useMemo(() => Date.now(), []);
  const range = rangeFor(period, now, offset);
  const events = useLiveQuery(() => db.plays.where('at').between(range.start, range.end, true, false).toArray(), [range.start, range.end]);
  const all = useLiveQuery(() => db.plays.orderBy('at').toArray(), []);
  const recap = useMemo(() => computeRecap(events ?? [], period, now, offset), [events, period, now, offset]);
  const streak = useMemo(() => currentStreak(all ?? []), [all]);
  const roomy = recap.bars.length <= 12;
  const gap = roomy ? 'gap-2' : 'gap-[3px]';
  const peakSeconds = Math.max(1, ...recap.bars.map((b) => b.seconds));
  const empty = events !== undefined && recap.plays === 0;
  const hasAny = (all?.length ?? 0) > 0;

  return (
    <div className="page-enter pb-6">
      <ScreenHeader title="Recap" eyebrow="On this device only" back="/" />

      <div className="px-gutter">
        <div className="flex rounded-full bg-s2 p-1" role="tablist" aria-label="Period">
          {PERIODS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={period === k} onClick={() => { setPeriod(k); setOffset(0); }}
              className={`press h-9 flex-1 rounded-full text-footnote font-semibold ${period === k ? 'bg-fg text-black' : 'text-fg-2'}`}>{label}</button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button className="press flex h-9 w-9 items-center justify-center rounded-full bg-s2" aria-label={`Previous ${period}`} onClick={() => setOffset((o) => o - 1)}><ChevronLeft size={20} /></button>
          <div className="text-center" aria-live="polite">
            <div className="text-body font-semibold" data-testid="recap-label">{range.label}</div>
            {offset === 0 && <div className="text-caption text-fg-3">{NOUN[period]}</div>}
          </div>
          <button className="press flex h-9 w-9 items-center justify-center rounded-full bg-s2 disabled:opacity-30" aria-label={`Next ${period}`} disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))}><ChevronRight size={20} /></button>
        </div>
      </div>

      {empty ? (
        <div className="mx-gutter mt-6 rounded-xl bg-s2 p-5" data-testid="recap-empty">
          <h2 className="text-body-lg font-semibold">{hasAny ? 'Nothing played in this period' : 'No listening yet'}</h2>
          <p className="mt-1 text-footnote text-fg-2">{hasAny ? 'Try another day, week, month or year.' : 'A song counts once you have listened to 30 seconds of it. Your recap is built from that, stored only on this device.'}</p>
        </div>
      ) : (
        <>
          <section className="mx-gutter mt-5 rounded-xl bg-s1 p-5" aria-label="Summary">
            <div className="text-caption uppercase tracking-wider text-fg-3">Time listening</div>
            <div className="mt-1 text-display font-bold tabular-nums" data-testid="recap-time">{formatListening(recap.seconds)}</div>
            <div className="mt-4 grid grid-cols-4 gap-3">
              <Stat value={recap.plays} label="plays" />
              <Stat value={recap.uniqueTracks} label="songs" />
              <Stat value={recap.uniqueArtists} label="artists" />
              <Stat value={streak} label={streak === 1 ? 'day streak' : 'day streak'} />
            </div>
            <div className={`mt-5 flex h-24 items-end ${gap}`} role="img" aria-label={`Listening over ${NOUN[period] === 'today' ? 'the day' : period}`} data-testid="recap-bars">
              {recap.bars.map((b, i) => (
                <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                  <div className={`mx-auto w-full max-w-[1.75rem] rounded-t-[3px] ${i === recap.peak ? 'bg-fg' : 'bg-fg/45'}`} style={{ height: `${b.seconds ? Math.max(4, (b.seconds / peakSeconds) * 100) : 2}%`, opacity: b.seconds ? 1 : 0.35 }} />
                </div>
              ))}
            </div>
            <div className={`mt-1 flex ${gap} text-[0.625rem] text-fg-3`} aria-hidden="true">
              {recap.bars.map((b, i) => <span key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">{b.label}</span>)}
            </div>
          </section>

          <div className="mt-7">
            <RankList title="Top artists" rows={recap.topArtists} kind="artist" />
            <RankList title="Top songs" rows={recap.topTracks} kind="track" />
            <RankList title="Top albums" rows={recap.topAlbums} kind="album" />
          </div>
        </>
      )}
      <div className="mx-gutter mb-3"><StatsSaver /></div>
      <p className="px-gutter text-center text-caption text-fg-3">Counted after 30 seconds of a song. Never uploaded. Clear it in Settings.</p>
    </div>
  );
}
