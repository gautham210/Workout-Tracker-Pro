import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyToDraft, blankSet, buildExercise, buildWorkoutGraph, clearDraft, draftKey, draftNeedsConfirm, hasLoggedSets, inferTitle,
  mergeExercises, readDraft, splitDayLabel, totalVolume, writeDraft,
} from '../src/product/workoutDraft.js';

const memory = () => { const map = new Map(); return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => { map.delete(k); }, map }; };
const bench = { id: 'bench', name: 'Bench Press', muscle_group: 'Chest' };
const row = { id: 'row', name: 'Row', muscle_group: 'Back' };
const squat = { id: 'squat', name: 'Squat', muscle_group: 'Legs' };
const done = (item, index, patch = {}) => { Object.assign(item.sets[index], { completed: true, weight_kg: '50', reps: '5', ...patch }); return item; };

test('mergeExercises appends new movements and never duplicates or touches existing sets', () => {
  const existing = [done(buildExercise(bench), 0)];
  const { exercises, added, skipped } = mergeExercises(existing, [buildExercise(bench), buildExercise(row)]);
  assert.equal(exercises.length, 2);
  assert.equal(added.length, 1);
  assert.equal(skipped.length, 1);
  assert.equal(exercises[0].sets[0].completed, true);
});

test('applyToDraft merges, keeps running phase/startedAt/graphId and starts a build draft once', () => {
  const storage = memory();
  const first = applyToDraft('u1', [buildExercise(bench)], { title: 'Push', storage, startNow: true, now: 1000 });
  assert.equal(first.draft.phase, 'active');
  assert.equal(first.draft.startedAt, 1000);
  assert.ok(first.draft.graphId);
  const second = applyToDraft('u1', [buildExercise(row)], { title: 'Pull', storage, startNow: true, now: 9999 });
  assert.equal(second.draft.startedAt, 1000);
  assert.equal(second.draft.graphId, first.draft.graphId);
  assert.equal(second.draft.title, 'Push');
  assert.equal(readDraft('u1', storage).sessionExercises.length, 2);
});

test('draftNeedsConfirm is true only for a running workout or logged sets', () => {
  const storage = memory();
  assert.equal(draftNeedsConfirm('u1', storage), false);
  applyToDraft('u1', [buildExercise(bench)], { storage });
  assert.equal(draftNeedsConfirm('u1', storage), false);
  const draft = readDraft('u1', storage);
  done(draft.sessionExercises[0], 0);
  writeDraft('u1', draft, storage);
  assert.equal(draftNeedsConfirm('u1', storage), true);
});

test('drafts are user scoped and clearDraft removes the key', () => {
  const storage = memory();
  writeDraft('u1', { sessionExercises: [buildExercise(bench)] }, storage);
  assert.equal(readDraft('u2', storage), null);
  assert.ok(storage.map.has(draftKey('u1')));
  clearDraft('u1', storage);
  assert.equal(readDraft('u1', storage), null);
});

test('writeDraft survives a throwing storage', () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.equal(writeDraft('u1', { sessionExercises: [] }, broken), false);
  assert.doesNotThrow(() => clearDraft('u1', broken));
});

test('warm-up sets are sent but excluded from volume; incomplete and zero-rep sets are not sent', () => {
  const item = buildExercise(bench, { sets: 4 });
  done(item, 0, { is_warmup: true, weight_kg: '20', reps: '10', notes: 'easy' });
  done(item, 1, { weight_kg: '60', reps: '5', rpe: '8', rir: '0' });
  done(item, 2, { reps: '0' });
  const exercises = [{ ...item, notes: 'felt good', plannedRestSeconds: 120 }];
  assert.equal(totalVolume(exercises), 300);
  const graph = buildWorkoutGraph({ graphId: '11111111-2222-4333-8444-555555555555', exercises, startedAt: 0, title: 'Push', now: 30 * 60_000 });
  assert.equal(graph.split_day, 'Push');
  assert.equal(graph.duration_minutes, 30);
  assert.equal(graph.exercises[0].notes, 'felt good');
  assert.equal(graph.exercises[0].rest_seconds, 120);
  const sets = graph.exercises[0].sets;
  assert.equal(sets.length, 2);
  assert.deepEqual(sets.map((s) => [s.set_number, s.is_warmup, s.rpe, s.rir]), [[1, true, null, null], [2, false, 8, 0]]);
  assert.equal(sets[0].notes, 'easy');
});

test('graph payload is identical across retries and null when nothing was completed', () => {
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const exercises = [done(buildExercise(bench), 0), done(buildExercise(row), 0)];
  const a = buildWorkoutGraph({ graphId: id, exercises, startedAt: 5, now: 60_000 });
  const b = buildWorkoutGraph({ graphId: id, exercises, startedAt: 5, now: 60_000 });
  assert.deepEqual(a, b);
  assert.notEqual(a.exercises[0].id, a.exercises[1].id);
  assert.equal(buildWorkoutGraph({ graphId: id, exercises: [buildExercise(squat)], startedAt: 5 }), null);
});

test('split day uses the plan title, then a muscle-group label, then Custom', () => {
  assert.equal(splitDayLabel('  Upper   A '), 'Upper A');
  assert.equal(splitDayLabel('', 'Chest & Back'), 'Chest & Back');
  assert.equal(splitDayLabel(null), 'Custom');
  assert.equal(inferTitle([buildExercise(bench), buildExercise(bench), buildExercise(row)]), 'Chest & Back');
  const graph = buildWorkoutGraph({ graphId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', exercises: [done(buildExercise(bench), 0)], startedAt: 0, title: null, fallbackTitle: 'Chest' });
  assert.equal(graph.split_day, 'Chest');
});

test('hasLoggedSets and blankSet defaults', () => {
  assert.equal(hasLoggedSets([buildExercise(bench)]), false);
  assert.deepEqual({ ...blankSet(), id: 'x' }, { id: 'x', weight_kg: '', reps: '', rpe: '', rir: '', notes: '', is_warmup: false, completed: false });
});
