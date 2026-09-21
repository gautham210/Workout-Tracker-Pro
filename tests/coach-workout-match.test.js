import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCatalogExercise } from '../src/product/coachWorkoutMatch.js';

const catalog = [
  { id: 'incline', name: 'Incline Dumbbell Bench Press' },
  { id: 'flat', name: 'Dumbbell Bench Press' },
  { id: 'machine', name: 'Machine Chest Press' },
];

test('Coach plan handoff accepts only exact or unambiguous catalog shorthand', () => {
  assert.equal(matchCatalogExercise('Incline DB Press', catalog)?.id, 'incline');
  assert.equal(matchCatalogExercise('Machine Chest Press', catalog)?.id, 'machine');
  assert.equal(matchCatalogExercise('Bench Press', catalog), null);
  assert.equal(matchCatalogExercise('', catalog), null);
});
