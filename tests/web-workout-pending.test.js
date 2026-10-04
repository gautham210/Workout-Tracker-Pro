import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueuePendingWorkout, flushPendingWorkouts, getPendingWorkouts, isNetworkError, pendingKey, removePendingWorkout } from '../src/product/pendingSync.js';

const memory = () => { const map = new Map(); return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => { map.delete(k); }, map }; };
const graph = (id) => ({ id, is_finished: true, exercises: [] });

test('queue is per user, idempotent per graph id, and removable', () => {
  const storage = memory();
  assert.equal(enqueuePendingWorkout('u1', graph('a'), { storage, now: 1 }), true);
  enqueuePendingWorkout('u1', graph('a'), { storage, now: 2 });
  enqueuePendingWorkout('u1', graph('b'), { storage, now: 3 });
  assert.equal(getPendingWorkouts('u1', storage).length, 2);
  assert.equal(getPendingWorkouts('u2', storage).length, 0);
  assert.ok(storage.map.has(pendingKey('u1')));
  removePendingWorkout('u1', 'a', storage);
  removePendingWorkout('u1', 'b', storage);
  assert.equal(storage.map.has(pendingKey('u1')), false);
});

test('corrupt storage reads as empty and enqueue reports a failed write', () => {
  const storage = memory();
  storage.setItem(pendingKey('u1'), '{nope');
  assert.deepEqual(getPendingWorkouts('u1', storage), []);
  const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  assert.equal(enqueuePendingWorkout('u1', graph('a'), { storage: broken }), false);
});

test('flush sends oldest first, clears successes and stops on a network error', async () => {
  const storage = memory();
  enqueuePendingWorkout('u1', graph('late'), { storage, now: 20 });
  enqueuePendingWorkout('u1', graph('early'), { storage, now: 10 });
  const sent = [];
  const outcome = await flushPendingWorkouts('u1', async (g) => { sent.push(g.id); return g.id === 'early' ? {} : { error: new Error('Failed to fetch') }; }, { storage, online: true });
  assert.deepEqual(sent, ['early', 'late']);
  assert.deepEqual(outcome.synced, ['early']);
  assert.equal(outcome.remaining.length, 1);
  assert.equal(outcome.remaining[0].attempts, 1);
});

test('a non-network error keeps the entry but lets later entries sync', async () => {
  const storage = memory();
  enqueuePendingWorkout('u1', graph('bad'), { storage, now: 1 });
  enqueuePendingWorkout('u1', graph('good'), { storage, now: 2 });
  const outcome = await flushPendingWorkouts('u1', async (g) => (g.id === 'bad' ? { error: new Error('invalid exercise') } : {}), { storage, online: true });
  assert.deepEqual(outcome.synced, ['good']);
  assert.deepEqual(outcome.remaining.map((e) => e.id), ['bad']);
});

test('isNetworkError recognises offline and fetch failures only', () => {
  assert.equal(isNetworkError(new Error('x'), false), true);
  assert.equal(isNetworkError({ message: 'TypeError: Failed to fetch' }, true), true);
  assert.equal(isNetworkError({ message: 'permission denied' }, true), false);
});
