import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const count = (text, expression) => (text.match(expression) || []).length;

test('app shell owns one dock and Coach owns one fixed prompt', () => {
  const shell = source('src/product/AppShell.jsx');
  const coach = source('src/product/CoachExperience.jsx');
  const nutritionist = source('src/product/NutritionistExperience.jsx');

  assert.equal(count(shell, /<Dock\b/g), 1);
  assert.equal(count(coach, /<PromptBar\b/g), 1);
  assert.equal(count(nutritionist, /<PromptBar\b/g), 1);
});

test('progress renders a recovery state instead of stacking it with the empty state', () => {
  const progress = source('src/product/ProgressExperience.jsx');

  assert.match(progress, /if \(error\) return[\s\S]*?<ProgressError/);
  assert.equal(count(progress, /<ProgressEmpty\b/g), 1);
  assert.equal(count(progress, /<ProgressError\b/g), 1);
});
