import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBodyMetrics, roundMetric, fiberTarget, waterTarget } from '../src/lib/athleteMetrics.js';

const male = { weightKg: 80, heightCm: 180, age: 30, sex: 'male', activityLevel: 'moderate', goal: 'hypertrophy', waistCm: 84, neckCm: 38 };

test('body metrics returns established estimate fields only when inputs support them', () => {
  const result = calculateBodyMetrics(male);
  assert.equal(roundMetric(result.bmi, 1), 24.7);
  assert.equal(roundMetric(result.bmr), 1780);
  assert.equal(roundMetric(result.tdee), 2759);
  assert.ok(result.targetCalories > result.tdee);
  assert.ok(result.proteinG >= 160);
  assert.ok(result.bodyFatPercentage > 2 && result.bodyFatPercentage < 75);
  assert.deepEqual(result.needs, []);
});

test('body metrics never invents estimates from insufficient or impossible values', () => {
  const result = calculateBodyMetrics({ weightKg: -3, heightCm: 180, age: 30, sex: 'male' });
  assert.equal(result.bmi, null);
  assert.equal(result.bmr, null);
  assert.equal(result.bodyFatPercentage, null);
});

test('maintenance and goal adjustments', () => {
  const loss = calculateBodyMetrics({ ...male, goal: 'fat_loss' });
  const gain = calculateBodyMetrics(male);
  const keep = calculateBodyMetrics({ ...male, goal: 'maintenance' });
  assert.equal(roundMetric(keep.targetCalories), roundMetric(keep.tdee));
  assert.equal(roundMetric(loss.targetCalories), roundMetric(loss.tdee - 400));
  assert.equal(roundMetric(gain.targetCalories), roundMetric(gain.tdee + 250));
  assert.equal(roundMetric(loss.proteinG), 160);
});

test('female BMR constant, and Navy body fat needs hips for women', () => {
  const f = calculateBodyMetrics({ weightKg: 60, heightCm: 165, age: 28, sex: 'female', activityLevel: 'light', waistCm: 70, neckCm: 31 });
  assert.equal(roundMetric(f.bmr), Math.round(10 * 60 + 6.25 * 165 - 5 * 28 - 161));
  assert.equal(f.bodyFatPercentage, null);
  assert.match(f.hints.bodyFat, /hips/);
  const withHips = calculateBodyMetrics({ weightKg: 60, heightCm: 165, age: 28, sex: 'female', waistCm: 70, neckCm: 31, hipsCm: 95 });
  assert.ok(withHips.bodyFatPercentage > 5 && withHips.bodyFatPercentage < 60);
  assert.ok(withHips.leanMassKg + withHips.fatMassKg > 59.99);
});

test('weight-only logging yields protein and water, and explains what is missing', () => {
  const r = calculateBodyMetrics({ weightKg: 75 });
  assert.equal(r.bmi, null);
  assert.equal(r.bmr, null);
  assert.equal(r.targetCalories, null);
  assert.equal(roundMetric(r.proteinG), 120);
  assert.equal(r.waterMl, 2625);
  assert.deepEqual(r.needs.slice(0, 2), ['height', 'age']);
  assert.match(r.hints.bmi, /height/);
  assert.match(r.hints.bmr, /sex/);
});

test('unspecified sex blocks BMR, empty strings are not zeros, and age must be a whole number', () => {
  assert.equal(calculateBodyMetrics({ ...male, sex: 'unspecified' }).bmr, null);
  assert.match(calculateBodyMetrics({ ...male, sex: 'unspecified' }).hints.bmr, /sex/);
  assert.equal(calculateBodyMetrics({ ...male, age: 30.5 }).bmr, null);
  assert.equal(calculateBodyMetrics({ ...male, age: '' }).bmr, null);
  assert.equal(calculateBodyMetrics({ weightKg: '', heightCm: '' }).bmi, null);
});

test('fiber and water helpers', () => {
  assert.equal(fiberTarget(2000), 28);
  assert.equal(fiberTarget(1200), 25);
  assert.equal(fiberTarget(null), null);
  assert.equal(waterTarget(null), null);
});
