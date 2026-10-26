import type { PlayEvent, SkipEvent, Track } from './types';

/**
 * Listening patterns, learned on the device from the listening log (no cloud, no model): plain counting rules you can
 * read. Each listen is filed under a part of the day; recent listens count more than old ones; songs you skip at that
 * time of day count against them. The app then offers "your evening music" in the evening, and so on.
 */

export type Slot = 'morning' | 'afternoon' | 'evening' | 'night';
export const SLOTS: Slot[] = ['morning', 'afternoon', 'evening', 'night'];

export const SLOT_INFO: Record<Slot, { label: string; title: string; when: string; hours: string }> = {
  morning: { label: 'Morning', title: 'Your mornings', when: 'in the morning', hours: '5:00–12:00' },
  afternoon: { label: 'Afternoon', title: 'Your afternoons', when: 'in the afternoon', hours: '12:00–17:00' },
  evening: { label: 'Evening', title: 'Your evenings', when: 'in the evening', hours: '17:00–22:00' },
  night: { label: 'Night', title: 'Late at night', when: 'at night', hours: '22:00–5:00' },
};

export function slotOf(at: number | Date): Slot {
  const h = (at instanceof Date ? at : new Date(at)).getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

/** A listen from this many days ago counts half as much as one from today. */
export const HALF_LIFE_DAYS = 45;
const DAY = 86_400_000;
const weight = (at: number, now: number) => 0.5 ** (Math.max(0, now - at) / DAY / HALF_LIFE_DAYS);

const zero = (): Record<Slot, number> => ({ morning: 0, afternoon: 0, evening: 0, night: 0 });

export interface TrackPattern {
  trackId: string;
  /** Recency-weighted listens per part of the day. */
  weighted: Record<Slot, number>;
  /** Plain counts, for explanations. */
  plays: Record<Slot, number>;
  skips: Record<Slot, number>;
  total: number;
  totalPlays: number;
}

export function learnPatterns(plays: PlayEvent[], skips: SkipEvent[] = [], now = Date.now()): Map<string, TrackPattern> {
  const m = new Map<string, TrackPattern>();
  const get = (id: string) => {
    let p = m.get(id);
    if (!p) { p = { trackId: id, weighted: zero(), plays: zero(), skips: zero(), total: 0, totalPlays: 0 }; m.set(id, p); }
    return p;
  };
  for (const e of plays) {
    const p = get(e.trackId), s = slotOf(e.at), w = weight(e.at, now);
    p.weighted[s] += w; p.plays[s]++; p.total += w; p.totalPlays++;
  }
  for (const e of skips) get(e.trackId).skips[slotOf(e.at)]++;
  return m;
}

/** Minimum real listens in a part of the day before a song counts as belonging to it. */
export const MIN_SLOT_PLAYS = 2;
/** Share of a song's (weighted) listens that must fall in the part of the day. */
export const MIN_SHARE = 0.4;

export interface SlotPick { track: Track; score: number; share: number; reason: string }

/**
 * Songs that belong to this part of the day for you. Share is smoothed (a song played once in the evening is not
 * "100% evening"), skips in that part of the day push a song down, and a song skipped more than played is left out.
 */
export function picksFor(slot: Slot, patterns: Map<string, TrackPattern>, tracks: Track[], limit = 12): SlotPick[] {
  const out: SlotPick[] = [];
  for (const t of tracks) {
    const p = patterns.get(t.id);
    if (!p || p.plays[slot] < MIN_SLOT_PLAYS) continue;
    const share = (p.weighted[slot] + 0.5) / (p.total + 2);
    if (share < MIN_SHARE) continue;
    const sk = p.skips[slot];
    if (sk > p.plays[slot]) continue;
    const score = p.weighted[slot] * (share / 0.25) / (1 + sk * 0.5) * (t.favorite ? 1.15 : 1);
    out.push({ track: t, score, share, reason: `${p.plays[slot]} of your ${p.totalPlays} listens were ${SLOT_INFO[slot].when}` });
  }
  return out.sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title)).slice(0, limit);
}

/** When a song is usually played, for its menu: "Usually in the evening (8 of 11 listens)". null without a clear habit. */
export function habitOf(p: TrackPattern | undefined): { slot: Slot; text: string } | null {
  if (!p || p.totalPlays < 3) return null;
  const slot = SLOTS.reduce((a, b) => (p.weighted[b] > p.weighted[a] ? b : a));
  if (p.plays[slot] < MIN_SLOT_PLAYS || (p.weighted[slot] + 0.5) / (p.total + 2) < MIN_SHARE) return null;
  return { slot, text: `Usually ${SLOT_INFO[slot].when} (${p.plays[slot]} of ${p.totalPlays} listens)` };
}

export interface SlotSummary { slot: Slot; seconds: number; share: number; plays: number; topArtist?: string; topTrack?: { title: string; artist: string } }

/** How a period's listening splits over the day, with the favourite artist and song for each part. */
export function rhythmSummary(plays: PlayEvent[]): SlotSummary[] {
  const total = plays.reduce((n, e) => n + e.seconds, 0) || 1;
  return SLOTS.map((slot) => {
    const ev = plays.filter((e) => slotOf(e.at) === slot);
    const tally = (key: (e: PlayEvent) => string) => {
      const c = new Map<string, number>();
      for (const e of ev) c.set(key(e), (c.get(key(e)) ?? 0) + 1);
      return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    };
    const topTrack = tally((e) => `${e.title}\u0000${e.artist}`);
    const seconds = ev.reduce((n, e) => n + e.seconds, 0);
    return {
      slot, seconds, share: seconds / total, plays: ev.length, topArtist: tally((e) => e.artist),
      topTrack: topTrack ? { title: topTrack.split('\u0000')[0], artist: topTrack.split('\u0000')[1] } : undefined,
    };
  });
}

/** The part of the day you listen most in, if one stands out (over 40% of the time). */
export function peakSlot(summary: SlotSummary[]): Slot | null {
  const top = [...summary].sort((a, b) => b.seconds - a.seconds)[0];
  return top && top.plays >= 3 && top.share > 0.4 ? top.slot : null;
}
