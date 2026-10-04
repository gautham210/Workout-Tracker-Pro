import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { EXERCISE_CATALOG, MOVEMENT_PATTERNS, findCatalogExercise, resolveExercise } from '../shared/exerciseCatalog.js';
import { exerciseSceneSvg, exerciseSceneDataUri } from '../shared/exerciseScenes.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const seeded = [...read('supabase/migrations/04_seed_exercises.sql').matchAll(/\('([^']+)', '[A-Za-z]+', '/g)].map((match) => match[1]);

test('catalogue keys and names are unique', () => {
  assert.equal(new Set(EXERCISE_CATALOG.map((entry) => entry.key)).size, EXERCISE_CATALOG.length);
  assert.equal(new Set(EXERCISE_CATALOG.map((entry) => entry.name)).size, EXERCISE_CATALOG.length);
});

test('every seeded exercise resolves to its own canonical record', () => {
  assert.ok(seeded.length >= 26);
  for (const name of seeded) assert.equal(findCatalogExercise(name)?.name, name, name);
});

test('specific names are never captured by a shorter label', () => {
  assert.equal(findCatalogExercise('Romanian Deadlift').key, 'romanian-deadlift');
  assert.equal(findCatalogExercise('Incline Dumbbell Press').key, 'incline-dumbbell-press');
  assert.equal(findCatalogExercise('wide grip lat pulldown').key, 'lat-pulldown');
  assert.equal(findCatalogExercise('DB bench press').key, 'flat-dumbbell-press');
  assert.equal(findCatalogExercise('Totally invented machine'), null);
});

test('every exercise, including unknown ones, has a drawable scene', () => {
  for (const name of [...seeded, 'Zercher Carry', '', undefined]) {
    const art = resolveExercise({ name }).art;
    assert.ok(MOVEMENT_PATTERNS.includes(art.scene), `${name}: ${art.scene}`);
    assert.match(exerciseSceneSvg(art.scene), /^<svg [^>]*viewBox="0 0 160 118"/);
  }
  assert.equal(exerciseSceneSvg('not-a-pattern'), exerciseSceneSvg('movement'));
  assert.match(exerciseSceneDataUri('squat'), /^data:image\/svg\+xml/);
});

test('every movement pattern has its own scene', () => {
  const rendered = new Set(MOVEMENT_PATTERNS.map(exerciseSceneSvg));
  assert.equal(rendered.size, MOVEMENT_PATTERNS.length);
});

test('bundled photographs exist as real JPEG files and are registered on web and mobile', () => {
  const files = readdirSync(new URL('../shared/exercise-art/', import.meta.url)).filter((file) => file.endsWith('.jpg'));
  const mobile = read('mobile/lib/exerciseArt.ts');
  const photoKeys = new Set(EXERCISE_CATALOG.map((entry) => entry.photo).filter(Boolean));
  for (const key of photoKeys) assert.ok(files.includes(`${key}.jpg`), `${key}.jpg missing`);
  for (const file of files) {
    const bytes = readFileSync(new URL(`../shared/exercise-art/${file}`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${file} is not a JPEG`);
    assert.ok(bytes.length > 5_000 && bytes.length < 200_000, `${file} size`);
    assert.ok(mobile.includes(`require('../../shared/exercise-art/${file}')`), `${file} not registered for Expo`);
  }
});

test('no exercise artwork depends on a remote URL', () => {
  for (const path of ['src/product/ExerciseVisual.jsx', 'src/product/exerciseArt.js', 'mobile/lib/exerciseArt.ts', 'mobile/components/ExerciseVisual.tsx', 'shared/exerciseCatalog.js']) {
    assert.doesNotMatch(read(path), /https?:\/\/(?!www\.w3\.org)/, path);
  }
});
