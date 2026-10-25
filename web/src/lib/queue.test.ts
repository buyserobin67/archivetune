import { describe, expect, it } from 'vitest';
import * as Q from './queue';

const seq = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i));
const fixedRand = () => 0; // deterministic shuffle
const start = (ids = seq(5), at = 0) => Q.setQueue(Q.emptyQueue(), ids, at);

describe('queue operations', () => {
  it('sets the queue and starts at the chosen index', () => {
    const q = start(seq(4), 2);
    expect(Q.currentId(q)).toBe('c');
    expect(q.items).toEqual(['a', 'b', 'c', 'd']);
  });

  it('empty queue has no current track', () => {
    expect(Q.currentId(Q.setQueue(Q.emptyQueue(), []))).toBeNull();
  });

  it('adds to end and plays next', () => {
    let q = start(seq(3), 0);
    q = Q.addToEnd(q, ['x']);
    q = Q.playNext(q, ['y', 'z']);
    expect(q.items).toEqual(['a', 'y', 'z', 'b', 'c', 'x']);
    expect(Q.currentId(q)).toBe('a');
  });

  it('adding to an empty queue selects the first item', () => {
    const q = Q.addToEnd(Q.emptyQueue(), ['x', 'y']);
    expect(Q.currentId(q)).toBe('x');
  });

  it('removes items and keeps the current track stable', () => {
    let q = start(seq(5), 2); // current = c
    q = Q.removeAt(q, 0);
    expect(Q.currentId(q)).toBe('c');
    q = Q.removeAt(q, q.index); // remove current -> next takes its place
    expect(Q.currentId(q)).toBe('d');
    q = Q.removeAt(q, 99); // out of range
    expect(q.items).toEqual(['b', 'd', 'e']);
  });

  it('removing the last item empties the queue', () => {
    expect(Q.removeAt(start(['a']), 0).index).toBe(-1);
  });

  it('reorders without losing the current track', () => {
    let q = start(seq(5), 1); // current = b
    q = Q.move(q, 4, 0);
    expect(q.items).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(Q.currentId(q)).toBe('b');
    q = Q.move(q, 2, 4); // move the current track
    expect(Q.currentId(q)).toBe('b');
    expect(q.index).toBe(4);
  });

  it('next/previous walk the queue and stop at the end with repeat off', () => {
    let q = start(seq(3), 1);
    q = Q.next(q).state; expect(Q.currentId(q)).toBe('c');
    const end = Q.next(q); expect(end.ended).toBe(true); expect(end.state.index).toBe(2);
    q = Q.previous(q); expect(Q.currentId(q)).toBe('b');
    expect(Q.previous(start(seq(3), 0)).index).toBe(0);
  });

  it('repeat all wraps both ways, repeat one replays on auto-advance only', () => {
    let q: Q.QueueState = { ...start(seq(3), 2), repeat: 'all' };
    expect(Q.currentId(Q.next(q, true).state)).toBe('a');
    q = { ...start(seq(3), 0), repeat: 'all' };
    expect(Q.currentId(Q.previous(q))).toBe('c');
    q = { ...start(seq(3), 0), repeat: 'one' };
    const auto = Q.next(q, true);
    expect(auto.ended).toBe(false);
    expect(auto.state.index).toBe(0);
    expect(Q.next(q, false).state.index).toBe(1); // manual skip still advances
  });

  it('repeat modes cycle off -> all -> one -> off', () => {
    expect(Q.nextRepeat('off')).toBe('all');
    expect(Q.nextRepeat('all')).toBe('one');
    expect(Q.nextRepeat('one')).toBe('off');
  });

  it('shuffle keeps the current track first and is reversible', () => {
    let q = start(seq(6), 3); // d
    q = Q.setShuffle(q, true, fixedRand);
    expect(q.items[0]).toBe('d');
    expect([...q.items].sort()).toEqual(seq(6));
    expect(q.index).toBe(0);
    q = Q.setShuffle(q, false);
    expect(q.items).toEqual(seq(6));
    expect(Q.currentId(q)).toBe('d');
  });

  it('starting a queue with shuffle on plays the chosen track first', () => {
    const q = Q.setQueue({ ...Q.emptyQueue(), shuffle: true }, seq(5), 2, fixedRand);
    expect(Q.currentId(q)).toBe('c');
    expect(q.original).toEqual(seq(5));
    expect(q.items).toHaveLength(5);
  });

  it('clears upcoming tracks', () => {
    const q = Q.clearUpcoming(start(seq(5), 1));
    expect(q.items).toEqual(['a', 'b']);
  });

  it('prunes deleted tracks and keeps the current one if it survives', () => {
    const q = Q.prune(start(seq(5), 2), (id) => id !== 'a' && id !== 'd');
    expect(q.items).toEqual(['b', 'c', 'e']);
    expect(Q.currentId(q)).toBe('c');
    expect(Q.prune(start(seq(2), 0), () => false).index).toBe(-1);
  });
});
