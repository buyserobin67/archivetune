import { db as defaultDb, type CadenceDB } from './db';
import type { PlayEvent } from './types';

// ---- recording ----

/** A listen counts after 30 seconds, or half of a song shorter than a minute. */
export const countThreshold = (duration: number) => (duration > 0 && duration < 60 ? Math.max(3, duration / 2) : 30);

interface Meta { id: string; title: string; artist: string; album: string; duration: number }

/**
 * Turns playback progress into listens. Seconds only accumulate while playing and only for normal forward progress,
 * so seeking, scrubbing and looping do not inflate the total. One event per start of a song.
 */
export class ListenTracker {
  private meta: Meta | null = null;
  private last = 0;
  private listened = 0;
  private eventId: number | null = null;
  private startedAt = 0;

  constructor(private write: (e: PlayEvent) => Promise<number>, private update: (id: number, seconds: number) => Promise<void>, private now: () => number = Date.now) {}

  /** A new song was loaded (or the same one restarted). Flushes the previous one. */
  start(meta: Meta | null, at = 0): void {
    void this.flush();
    this.meta = meta;
    this.last = at;
    this.listened = 0;
    this.eventId = null;
    this.startedAt = 0;
  }

  /** Call on every timeupdate. */
  tick(currentTime: number, playing: boolean): void {
    const m = this.meta;
    if (!m) return;
    const d = currentTime - this.last;
    this.last = currentTime;
    if (!playing || d <= 0 || d > 2.5) return; // paused, seeked, or a jump
    this.listened += d;
    if (this.eventId === null && this.startedAt === 0 && this.listened >= countThreshold(m.duration)) {
      const ev: PlayEvent = { trackId: m.id, at: this.now(), seconds: this.listened, title: m.title, artist: m.artist, album: m.album };
      this.startedAt = ev.at;
      void this.write(ev).then((id) => { this.eventId = id; }).catch(() => {});
    }
  }

  /** Writes the final listened seconds for the current song. Safe to call often. */
  async flush(): Promise<void> {
    if (this.eventId !== null) await this.update(this.eventId, Math.round(this.listened)).catch(() => {});
  }
}

export const dbListenWriters = (d: CadenceDB = defaultDb) => ({
  write: (e: PlayEvent) => d.plays.add(e) as Promise<number>,
  update: async (id: number, seconds: number) => { await d.plays.update(id, { seconds }); },
});

// ---- recap ----

export type Period = 'day' | 'week' | 'month' | 'year';

export interface Range { start: number; end: number; label: string }

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The calendar range containing `anchor`, shifted by `offset` periods (0 = this one, -1 = the previous one). Weeks start on Monday. */
export function rangeFor(period: Period, anchor: number, offset = 0): Range {
  const a = new Date(anchor);
  let s: Date, e: Date, label: string;
  if (period === 'day') {
    s = startOfDay(a); s.setDate(s.getDate() + offset);
    e = new Date(s); e.setDate(e.getDate() + 1);
    label = s.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  } else if (period === 'week') {
    s = startOfDay(a); s.setDate(s.getDate() - ((s.getDay() + 6) % 7) + offset * 7);
    e = new Date(s); e.setDate(e.getDate() + 7);
    const last = new Date(e.getTime() - 1);
    label = `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  } else if (period === 'month') {
    s = new Date(a.getFullYear(), a.getMonth() + offset, 1);
    e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    label = s.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  } else {
    s = new Date(a.getFullYear() + offset, 0, 1);
    e = new Date(s.getFullYear() + 1, 0, 1);
    label = String(s.getFullYear());
  }
  return { start: s.getTime(), end: e.getTime(), label };
}

export interface Ranked { key: string; name: string; sub?: string; plays: number; seconds: number; trackId: string }
export interface Bar { label: string; seconds: number; plays: number }
export interface Recap {
  range: Range;
  plays: number;
  seconds: number;
  uniqueTracks: number;
  uniqueArtists: number;
  activeDays: number;
  topTracks: Ranked[];
  topArtists: Ranked[];
  topAlbums: Ranked[];
  bars: Bar[];
  /** Busiest bar index, -1 when empty. */
  peak: number;
}

const byWeight = (a: Ranked, b: Ranked) => b.plays - a.plays || b.seconds - a.seconds || a.name.localeCompare(b.name);

function rank(events: PlayEvent[], keyOf: (e: PlayEvent) => string, nameOf: (e: PlayEvent) => string, subOf?: (e: PlayEvent) => string, limit = 5): Ranked[] {
  const m = new Map<string, Ranked>();
  for (const e of events) {
    const k = keyOf(e);
    const r = m.get(k) ?? { key: k, name: nameOf(e), sub: subOf?.(e), plays: 0, seconds: 0, trackId: e.trackId };
    r.plays++; r.seconds += e.seconds;
    m.set(k, r);
  }
  return [...m.values()].sort(byWeight).slice(0, limit);
}

export function computeRecap(all: PlayEvent[], period: Period, anchor = Date.now(), offset = 0): Recap {
  const range = rangeFor(period, anchor, offset);
  const ev = all.filter((e) => e.at >= range.start && e.at < range.end);
  const start = new Date(range.start);
  let n: number, labelOf: (i: number) => string, indexOf: (t: number) => number;
  if (period === 'day') {
    n = 24; labelOf = (i) => (i % 6 === 0 ? String(i) : ''); indexOf = (t) => new Date(t).getHours();
  } else if (period === 'week') {
    n = 7; labelOf = (i) => 'MTWTFSS'[i]; indexOf = (t) => (new Date(t).getDay() + 6) % 7;
  } else if (period === 'month') {
    n = Math.round((range.end - range.start) / 86_400_000); labelOf = (i) => ((i + 1) % 7 === 1 || i === 0 ? String(i + 1) : ''); indexOf = (t) => new Date(t).getDate() - 1;
  } else {
    n = 12; labelOf = (i) => 'JFMAMJJASOND'[i]; indexOf = (t) => new Date(t).getMonth();
  }
  void start;
  const bars: Bar[] = Array.from({ length: n }, (_, i) => ({ label: labelOf(i), seconds: 0, plays: 0 }));
  for (const e of ev) { const b = bars[Math.min(n - 1, Math.max(0, indexOf(e.at)))]; b.seconds += e.seconds; b.plays++; }
  const peakSeconds = Math.max(0, ...bars.map((b) => b.seconds));
  return {
    range,
    plays: ev.length,
    seconds: ev.reduce((s, e) => s + e.seconds, 0),
    uniqueTracks: new Set(ev.map((e) => e.trackId)).size,
    uniqueArtists: new Set(ev.map((e) => e.artist)).size,
    activeDays: new Set(ev.map((e) => startOfDay(new Date(e.at)).getTime())).size,
    topTracks: rank(ev, (e) => e.trackId, (e) => e.title, (e) => e.artist),
    topArtists: rank(ev, (e) => e.artist, (e) => e.artist),
    topAlbums: rank(ev, (e) => `${e.album}\u0000${e.artist}`, (e) => e.album, (e) => e.artist),
    bars,
    peak: peakSeconds > 0 ? bars.findIndex((b) => b.seconds === peakSeconds) : -1,
  };
}

/** "3 h 12 min", "47 min", "less than a minute". */
export function formatListening(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (seconds > 0 && m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Consecutive days with at least one listen, counting back from today (or yesterday if today is still empty). */
export function currentStreak(all: PlayEvent[], now = Date.now()): number {
  const days = new Set(all.map((e) => startOfDay(new Date(e.at)).getTime()));
  const d = startOfDay(new Date(now));
  if (!days.has(d.getTime())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(d.getTime())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export async function clearListeningHistory(d: CadenceDB = defaultDb): Promise<void> {
  await d.plays.clear();
}
