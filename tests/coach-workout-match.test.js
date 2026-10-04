import test from 'node:test';
import assert from 'node:assert/strict';
import { collectUnmatched, matchCatalogExercise, resolvePlanExercises } from '../src/product/coachWorkoutMatch.js';

const catalog = [
  { id: 'incline', name: 'Incline Dumbbell Bench Press' },
  { id: 'flat', name: 'Dumbbell Bench Press' },
  { id: 'machine', name: 'Machine Chest Press' },
  { id: 'curl', name: 'Leg Curl', slug: 'leg-curl' },
  { id: 'calf', name: 'Standing Calf Raise', slug: 'standing-calf-raise' },
  { id: 'fly', name: 'Cable Fly', aliases: ['cable flies'] },
];

test('Coach plan handoff accepts only exact or unambiguous catalog shorthand', () => {
  assert.equal(matchCatalogExercise('Incline DB Press', catalog)?.id, 'incline');
  assert.equal(matchCatalogExercise('Machine Chest Press', catalog)?.id, 'machine');
  assert.equal(matchCatalogExercise('Bench Press', catalog), null);
  assert.equal(matchCatalogExercise('', catalog), null);
});

test('aliases resolve through the row aliases and the shared catalogue', () => {
  assert.equal(matchCatalogExercise('Cable Flies', catalog)?.id, 'fly');
  assert.equal(matchCatalogExercise('hamstring curl', catalog)?.id, 'curl');
  assert.equal(matchCatalogExercise('Calf Raises', catalog)?.id, 'calf');
});

test('plurals and DB/BB shorthand normalise', () => {
  assert.equal(matchCatalogExercise('Machine Chest Presses', catalog)?.id, 'machine');
  assert.equal(matchCatalogExercise('Incline Dumbbells Bench Press', catalog)?.id, 'incline');
  assert.equal(matchCatalogExercise('Leg Curls', catalog)?.id, 'curl');
});

test('resolvePlanExercises prefers exerciseId and reports unmatched names instead of dropping them', () => {
  const { resolved, unmatched } = resolvePlanExercises([
    { name: 'Totally renamed', exerciseId: 'machine' },
    { name: 'Hamstring Curl' },
    { name: 'Zercher Squat' },
    { name: '  ' },
    { name: 'Server canonical', exerciseId: 'not-in-catalog' },
  ], catalog);
  assert.deepEqual(resolved.map((item) => item.exercise.id), ['machine', 'curl', 'not-in-catalog']);
  assert.deepEqual(unmatched, ['Zercher Squat']);
});

test('collectUnmatched merges server and local lists without duplicates', () => {
  assert.deepEqual(collectUnmatched({ unmatched: ['Zercher Squat'], unmatchedExercises: ['Sissy Squat'] }, ['zercher  squat', 'Jefferson Curl']), ['Zercher Squat', 'Sissy Squat', 'Jefferson Curl']);
  assert.deepEqual(collectUnmatched(null), []);
});
