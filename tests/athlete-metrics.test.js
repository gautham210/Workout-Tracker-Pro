import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBodyMetrics, roundMetric } from '../src/lib/athleteMetrics.js';

test('body metrics returns established estimate fields only when inputs support them', () => {
  const result = calculateBodyMetrics({ weightKg: 80, heightCm: 180, age: 30, sex: 'male', activityLevel: 'moderate', goal: 'hypertrophy', waistCm: 84, neckCm: 38 });
  assert.equal(roundMetric(result.bmi, 1), 24.7);
  assert.equal(roundMetric(result.bmr), 1780);
  assert.equal(roundMetric(result.tdee), 2759);
  assert.ok(result.targetCalories > result.tdee);
  assert.ok(result.proteinG >= 160);
  assert.ok(result.bodyFatPercentage > 2 && result.bodyFatPercentage < 75);
});

test('body metrics never invents estimates from insufficient or impossible values', () => {
  const result = calculateBodyMetrics({ weightKg: -3, heightCm: 180, age: 30, sex: 'male' });
  assert.equal(result.bmi, null);
  assert.equal(result.bmr, null);
  assert.equal(result.bodyFatPercentage, null);
});
