import type { RepeatMode } from './types';

/**
 * Pure queue model. `items` is the play order (already shuffled when shuffle is on);
 * `original` keeps the un-shuffled order so shuffle can be turned off again.
 */
export interface QueueState {
  items: string[];
  original: string[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export const emptyQueue = (): QueueState => ({ items: [], original: [], index: -1, shuffle: false, repeat: 'off' });

export const currentId = (q: QueueState): string | null => q.items[q.index] ?? null;

export function shuffled<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Replace the queue and start at `startIndex` of `ids`. With shuffle on, the chosen track plays first. */
export function setQueue(q: QueueState, ids: string[], startIndex = 0, rand?: () => number): QueueState {
  if (!ids.length) return { ...q, items: [], original: [], index: -1 };
  const start = Math.min(Math.max(startIndex, 0), ids.length - 1);
  if (!q.shuffle) return { ...q, items: [...ids], original: [...ids], index: start };
  const first = ids[start];
  const rest = shuffled(ids.filter((_, i) => i !== start), rand);
  return { ...q, items: [first, ...rest], original: [...ids], index: 0 };
}

export function addToEnd(q: QueueState, ids: string[]): QueueState {
  if (!ids.length) return q;
  const items = [...q.items, ...ids];
  return { ...q, items, original: [...q.original, ...ids], index: q.index < 0 ? 0 : q.index };
}

export function playNext(q: QueueState, ids: string[]): QueueState {
  if (!ids.length) return q;
  if (q.index < 0) return addToEnd(q, ids);
  const items = [...q.items];
  items.splice(q.index + 1, 0, ...ids);
  const cur = q.items[q.index];
  const original = [...q.original];
  const at = original.indexOf(cur);
  original.splice(at < 0 ? original.length : at + 1, 0, ...ids);
  return { ...q, items, original };
}

export function removeAt(q: QueueState, index: number): QueueState {
  if (index < 0 || index >= q.items.length) return q;
  const id = q.items[index];
  const items = q.items.filter((_, i) => i !== index);
  const oi = q.original.indexOf(id);
  const original = oi < 0 ? q.original : q.original.filter((_, i) => i !== oi);
  let idx = q.index;
  if (index < q.index) idx--;
  else if (index === q.index) idx = Math.min(idx, items.length - 1);
  return { ...q, items, original, index: items.length ? idx : -1 };
}

/** Puts an entry back where it was (undo of `removeAt`). `originalAt` is its old place in the un-shuffled order. */
export function insertAt(q: QueueState, index: number, id: string, originalAt = q.original.length): QueueState {
  const at = Math.min(Math.max(index, 0), q.items.length);
  const items = [...q.items];
  items.splice(at, 0, id);
  const original = [...q.original];
  original.splice(Math.min(Math.max(originalAt, 0), original.length), 0, id);
  const idx = q.index < 0 ? 0 : at <= q.index ? q.index + 1 : q.index;
  return { ...q, items, original, index: idx };
}

export function move(q: QueueState, from: number, to: number): QueueState {
  const n = q.items.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return q;
  const items = [...q.items];
  const [x] = items.splice(from, 1);
  items.splice(to, 0, x);
  let idx = q.index;
  if (from === q.index) idx = to;
  else if (from < q.index && to >= q.index) idx--;
  else if (from > q.index && to <= q.index) idx++;
  return { ...q, items, index: idx, original: q.shuffle ? q.original : [...items] };
}

export function jumpTo(q: QueueState, index: number): QueueState {
  return index >= 0 && index < q.items.length ? { ...q, index } : q;
}

export function clearUpcoming(q: QueueState): QueueState {
  if (q.index < 0) return q;
  const keep = q.items.slice(0, q.index + 1);
  return { ...q, items: keep, original: q.original.filter((id) => keep.includes(id)) };
}

/** Advance. `auto` = the track ended on its own (repeat-one replays; otherwise behaves like a manual skip). */
export function next(q: QueueState, auto = false): { state: QueueState; ended: boolean } {
  if (q.index < 0) return { state: q, ended: true };
  if (auto && q.repeat === 'one') return { state: q, ended: false };
  if (q.index + 1 < q.items.length) return { state: { ...q, index: q.index + 1 }, ended: false };
  if (q.repeat === 'all' || (!auto && q.items.length > 0 && q.repeat !== 'off')) return { state: { ...q, index: 0 }, ended: false };
  return { state: q, ended: true };
}

/** Previous. Callers restart the current track instead when more than a few seconds in. */
export function previous(q: QueueState): QueueState {
  if (q.index < 0) return q;
  if (q.index > 0) return { ...q, index: q.index - 1 };
  return q.repeat === 'all' && q.items.length > 1 ? { ...q, index: q.items.length - 1 } : q;
}

export function setShuffle(q: QueueState, on: boolean, rand?: () => number): QueueState {
  if (on === q.shuffle) return q;
  if (!on) {
    const cur = currentId(q);
    const idx = cur ? q.original.indexOf(cur) : -1;
    return { ...q, shuffle: false, items: [...q.original], index: idx >= 0 ? idx : q.index < 0 ? -1 : 0 };
  }
  const cur = currentId(q);
  const rest = shuffled(q.items.filter((_, i) => i !== q.index), rand);
  return { ...q, shuffle: true, items: cur ? [cur, ...rest] : rest, index: cur ? 0 : -1 };
}

export const nextRepeat = (m: RepeatMode): RepeatMode => (m === 'off' ? 'all' : m === 'all' ? 'one' : 'off');

/** Drop ids that no longer exist in the library (after deletes / restore). */
export function prune(q: QueueState, exists: (id: string) => boolean): QueueState {
  const cur = currentId(q);
  const items = q.items.filter(exists);
  const original = q.original.filter(exists);
  const idx = cur ? items.indexOf(cur) : -1;
  return { ...q, items, original, index: idx >= 0 ? idx : items.length ? 0 : -1 };
}

// ---- what the Queue screen shows ----

/** Entries after the current one. The current entry is never part of this list. */
export const upcoming = (q: QueueState): string[] => (q.index < 0 ? [] : q.items.slice(q.index + 1));

/** Entries already played (before the current one). */
export const history = (q: QueueState): string[] => (q.index < 0 ? [] : q.items.slice(0, q.index));

export type AfterCurrent =
  | { kind: 'next'; id: string }
  | { kind: 'repeat-one' }
  /** End of queue with repeat-all: playback wraps to the first entry. `same` = it is the song that is playing now. */
  | { kind: 'wrap'; id: string; same: boolean }
  | { kind: 'stop' };

/** What happens when the current song ends. Mirrors `next(q, true)`, but also says which song comes next. */
export function afterCurrent(q: QueueState): AfterCurrent {
  if (q.index < 0 || !q.items.length) return { kind: 'stop' };
  if (q.repeat === 'one') return { kind: 'repeat-one' };
  const up = upcoming(q);
  if (up.length) return { kind: 'next', id: up[0] };
  if (q.repeat === 'all') return { kind: 'wrap', id: q.items[0], same: q.items.length === 1 };
  return { kind: 'stop' };
}
