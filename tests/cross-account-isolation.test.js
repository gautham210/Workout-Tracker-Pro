import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueuePendingWorkout, getPendingWorkouts, removePendingWorkout, flushPendingWorkouts } from '../src/product/pendingSync.js';
import { writeDraft, readDraft, parseDraft, applyToDraft, draftKey } from '../src/product/workoutDraft.js';

// A storage double that behaves like localStorage, so no test depends on a real browser.
const memory = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
    _map: map,
  };
};

const A = 'user-a';
const B = 'user-b';

const graph = (id, day = 'Push Day') => ({
  id,
  is_finished: true,
  date: new Date('2026-03-04T09:30:00.000Z').toISOString(),
  split_type: 'custom',
  split_day: day,
  notes: '',
  duration_minutes: 45,
  exercises: [{
    id: 'se-1', exercise_id: 'ex-1', order_index: 0, notes: null, rest_seconds: 90,
    sets: [{ id: 's1', set_number: 1, weight_kg: 60, reps: 8, completed: true, rpe: 8, rir: 2, is_warmup: false, notes: null }],
  }],
});

test('queued workouts are namespaced per user', () => {
  const storage = memory();
  enqueuePendingWorkout(A, graph('graph-a', 'Push Day'), { storage });
  enqueuePendingWorkout(B, graph('graph-b', 'Pull Day'), { storage });

  assert.equal(getPendingWorkouts(A, storage).length, 1);
  assert.equal(getPendingWorkouts(B, storage).length, 1);
  assert.equal(getPendingWorkouts(A, storage)[0].graph.split_day, 'Push Day');
  assert.equal(getPendingWorkouts(B, storage)[0].graph.split_day, 'Pull Day');
  assert.equal(getPendingWorkouts('user-c', storage).length, 0);
});

test('removing a queued workout cannot remove another user queued workout with the same graph id', () => {
  const storage = memory();
  enqueuePendingWorkout(A, graph('shared-id'), { storage });
  enqueuePendingWorkout(B, graph('shared-id'), { storage });

  removePendingWorkout(A, 'shared-id', storage);

  assert.equal(getPendingWorkouts(A, storage).length, 0);
  assert.equal(getPendingWorkouts(B, storage).length, 1, 'user B must keep their queued workout');
});

test('flushing one account never sends or clears another account queue', async () => {
  const storage = memory();
  enqueuePendingWorkout(A, graph('a1'), { storage });
  enqueuePendingWorkout(B, graph('b1'), { storage });

  const sent = [];
  const result = await flushPendingWorkouts(A, async (g) => { sent.push(g.id); return {}; }, { storage });

  assert.deepEqual(sent, ['a1']);
  assert.deepEqual(result.synced, ['a1']);
  assert.equal(getPendingWorkouts(B, storage).length, 1, "user B's queue must be untouched");
  assert.equal(getPendingWorkouts(A, storage).length, 0);
});

test('a draft is never readable by another account', () => {
  const storage = memory();
  const ok = writeDraft(A, { phase: 'active', activeIndex: 0, startedAt: 1, graphId: 'g1', sessionExercises: [] }, storage);
  assert.equal(ok, true);

  assert.ok(readDraft(A, storage), 'the owner can read their draft');
  assert.equal(readDraft(B, storage), null, 'a different account must not read it');

  // Even with the raw key, ownership is re-validated rather than trusted.
  const raw = storage.getItem(draftKey(A));
  assert.equal(parseDraft(raw, B), null, 'ownership must be checked against the stored userId');
  assert.ok(parseDraft(raw, A), 'the owner still parses');
});

test('applying a draft for one account never creates one for another', () => {
  const storage = memory();
  const incoming = [{ exercise: { id: 'ex-1', name: 'Bench', muscle_group: 'Chest' }, plannedRestSeconds: 90, notes: '', sets: [] }];

  applyToDraft(A, incoming, { storage, startNow: true });
  assert.ok(readDraft(A, storage));
  assert.equal(readDraft(B, storage), null);
  assert.equal(storage.keys().filter((k) => k.includes(B)).length, 0, 'no key may be created for the other account');
});

test('sign-out sweep keeps unsynced workouts but removes every other per-user cache', () => {
  // Mirrors src/lib/api.js clearUserLocalCaches.
  const clearUserLocalCaches = (userId, storage) => {
    const known = [
      `wtp_profile_${userId}`,
      `wtp_workout_draft_v2_${userId}`,
      `wtp_coach_chat_history_${userId}`,
      `wtp_nutrition_journal_${userId}`,
    ];
    const swept = [];
    for (const key of storage.keys()) {
      if (key.startsWith('wtp_') && key.includes(userId) && !key.startsWith('wtp_pending_sync_')) swept.push(key);
    }
    for (const key of new Set([...known, ...swept])) storage.removeItem(key);
  };

  const storage = memory();
  enqueuePendingWorkout(A, graph('a1'), { storage });
  writeDraft(A, { phase: 'build', activeIndex: 0, sessionExercises: [] }, storage);
  storage.setItem(`wtp_coach_chat_history_${A}`, '[]');

  clearUserLocalCaches(A, storage);

  assert.equal(getPendingWorkouts(A, storage).length, 1, 'unsynced user data is deliberately preserved');
  assert.equal(readDraft(A, storage), null, 'draft cache is cleared');
  assert.equal(storage.getItem(`wtp_coach_chat_history_${A}`), null, 'chat history is cleared');
});
