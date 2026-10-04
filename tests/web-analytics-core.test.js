import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateE1RM, computePersonalBests, computeStreak, exerciseSignals, groupMealsByDay, lastDayKeys, localDayBounds, localDayKey,
  nextSplitDay, sessionVolume, weeklyBuckets, volumeLastDays, leadExercise, profileAge, isWorkingSet, addLocalDays,
} from '../src/product/analytics.js';

const set = (weight, reps, extra = {}) => ({ weight_kg: weight, reps, completed: true, ...extra });
const session = (date, exercises, id = date) => ({ id, date, is_finished: true, session_exercises: exercises.map(([name, sets], index) => ({ id: `${id}-${index}`, order_index: index, exercises: { name, muscle_group: 'Chest' }, sets })) });
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0).toISOString();

test('volume counts only completed non-warm-up sets', () => {
  const s = session(at(2026, 10, 1), [['Bench', [set(100, 5), set(60, 10, { is_warmup: true }), { weight_kg: 100, reps: 5, completed: false }, { weight_kg: 100, reps: 5 }, set(50, 0)]]]);
  assert.equal(sessionVolume(s), 500);
  assert.equal(isWorkingSet({ weight_kg: 1, reps: 1, completed: 1 }), false, 'completed must be boolean true');
});

test('e1RM uses Brzycki up to 10 effective reps and Epley above, with optional RIR', () => {
  assert.equal(Math.round(calculateE1RM(100, 5) * 10) / 10, 112.5);
  assert.equal(Math.round(calculateE1RM(100, 10) * 10) / 10, 133.3);
  assert.equal(Math.round(calculateE1RM(100, 15) * 10) / 10, 150);
  assert.ok(calculateE1RM(100, 5, 2) > calculateE1RM(100, 5));
  assert.equal(calculateE1RM(0, 5), 0);
  assert.equal(calculateE1RM(100, 0), 0);
  assert.equal(calculateE1RM('x', 5), 0);
});

test('personal bests are all-time per exercise, ranked by e1RM, ignore warm-ups and incomplete sets', () => {
  const sessions = [
    session(at(2026, 10, 3), [['Squat', [set(140, 3)]], ['Bench', [set(80, 8)]]], 'c'),
    session(at(2026, 6, 1), [['Bench', [set(100, 5), set(200, 1, { is_warmup: true }), { weight_kg: 300, reps: 1, completed: false }]]], 'b'),
    session(at(2025, 1, 1), [['Squat', [set(120, 5)]]], 'a'),
  ];
  const prs = computePersonalBests(sessions);
  assert.deepEqual(prs.map((p) => p.name), ['Squat', 'Bench']);
  assert.equal(prs[1].weight, 100, 'old heavier set wins over newer lighter one');
  assert.equal(prs[0].weight, 140);
  assert.equal(computePersonalBests(sessions, 1).length, 1);
});

test('streak counts consecutive local days and keeps today open', () => {
  const now = new Date(2026, 9, 10, 9, 0);
  const days = [10, 9, 8].map((d) => ({ date: at(2026, 10, d) }));
  assert.equal(computeStreak(days, { now }), 3);
  assert.equal(computeStreak([{ date: at(2026, 10, 9) }, { date: at(2026, 10, 8) }], { now }), 2, 'no workout yet today');
  assert.equal(computeStreak([{ date: at(2026, 10, 7) }], { now }), 0);
  assert.equal(computeStreak([], { now }), 0);
});

test('planned rest days do not break the streak but do not add to it', () => {
  // 2026-10-04 is a Sunday; Monday morning the streak is Sat, Fri.
  const now = new Date(2026, 9, 5, 9, 0);
  const sessions = [{ date: at(2026, 10, 3) }, { date: at(2026, 10, 2) }];
  assert.equal(computeStreak(sessions, { now }), 0, 'Sunday gap breaks it without rest days');
  assert.equal(computeStreak(sessions, { now, restDays: ['Sunday'], includeRestDays: true }), 2);
  assert.equal(computeStreak(sessions, { now, restDays: ['Sun'], includeRestDays: true }), 2, 'short names accepted');
  assert.equal(computeStreak(sessions, { now, restDays: ['Sunday'], includeRestDays: false }), 0);
  assert.equal(computeStreak([{ date: at(2026, 10, 3) }, { date: at(2026, 10, 1) }], { now, restDays: ['Sunday'], includeRestDays: true }), 1, 'a non-rest gap still breaks it');
});

test('streak is not capped at 18 sessions', () => {
  const now = new Date(2026, 9, 30, 9, 0);
  const days = Array.from({ length: 60 }, (_, i) => ({ date: addLocalDays(now, -i).toISOString() }));
  assert.equal(computeStreak(days, { now }), 60);
});

test('plateau and progressive overload signals follow the mobile heuristic', () => {
  const lift = (date, w, id) => session(at(...date), [['Bench', [set(w, 5)]]], id);
  const flat = [lift([2026, 9, 1], 100, 1), lift([2026, 9, 8], 100, 2), lift([2026, 9, 15], 100, 3), lift([2026, 9, 29], 101, 4)];
  assert.equal(exerciseSignals(flat)[0].status, 'plateau');
  const rising = [lift([2026, 9, 1], 100, 1), lift([2026, 9, 8], 102, 2), lift([2026, 9, 15], 107, 3), lift([2026, 9, 29], 110, 4)];
  assert.equal(exerciseSignals(rising)[0].status, 'progressing');
  const tooShort = [lift([2026, 9, 1], 100, 1), lift([2026, 9, 3], 100, 2), lift([2026, 9, 5], 100, 3), lift([2026, 9, 7], 100, 4)];
  assert.equal(exerciseSignals(tooShort)[0].status, 'insufficient', 'under 21 days');
  assert.equal(exerciseSignals(flat.slice(0, 3))[0].status, 'insufficient', 'under 4 sessions');
});

test('weekly buckets are Monday-start local weeks and sum working volume', () => {
  const now = new Date(2026, 9, 7, 12); // Wednesday
  const sessions = [session(at(2026, 10, 5), [['A', [set(10, 10)]]], 'm'), session(at(2026, 10, 4), [['A', [set(10, 5)]]], 's'), session(at(2026, 9, 1), [['A', [set(5, 5)]]], 'old')];
  const buckets = weeklyBuckets(sessions, 3, now);
  assert.equal(buckets.length, 3);
  assert.equal(buckets[2].key, '2026-10-05');
  assert.equal(buckets[2].volume, 100, 'Monday session is this week');
  assert.equal(buckets[1].volume, 50, 'Sunday session belongs to the previous week');
  assert.equal(buckets[0].volume, 0);
});

test('volumeLastDays uses real local days, not the latest N sessions', () => {
  const now = new Date(2026, 9, 10, 12);
  const sessions = [session(at(2026, 10, 10), [['A', [set(10, 10)]]], 'a'), session(at(2026, 10, 4), [['A', [set(10, 10)]]], 'b'), session(at(2026, 10, 3), [['A', [set(10, 10)]]], 'c')];
  assert.equal(volumeLastDays(sessions, 7, now), 200);
});

test('local day helpers ignore UTC and bound the local day', () => {
  const lateEvening = new Date(2026, 9, 4, 23, 30);
  assert.equal(localDayKey(lateEvening), '2026-10-04');
  const bounds = localDayBounds(lateEvening);
  assert.equal(bounds.start, new Date(2026, 9, 4, 0, 0, 0, 0).toISOString());
  assert.equal(bounds.end, new Date(2026, 9, 5, 0, 0, 0, 0).toISOString());
  assert.equal(lastDayKeys(3, lateEvening).join(), '2026-10-04,2026-10-03,2026-10-02');
  assert.equal(localDayKey('garbage'), '');
});

test('local day key is correct west of UTC when the UTC date has already rolled over', (t) => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const probe = new Date('2026-10-05T03:30:00Z');
    if (probe.getTimezoneOffset() !== 420) { t.skip('runtime cannot switch timezone'); return; }
    assert.equal(probe.toISOString().slice(0, 10), '2026-10-05');
    assert.equal(localDayKey(probe), '2026-10-04');
    assert.equal(localDayBounds(probe).start, '2026-10-04T07:00:00.000Z');
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('split rotation works with real split_day values', () => {
  const split = ['Push', 'Pull', 'Legs'];
  assert.deepEqual(nextSplitDay(split, 'push'), { title: 'Pull', known: true });
  assert.deepEqual(nextSplitDay(split, 'Legs'), { title: 'Push', known: true });
  assert.deepEqual(nextSplitDay(split, 'Day 2 - Pull'), { title: 'Legs', known: true });
  assert.deepEqual(nextSplitDay(split, 'Upper'), { title: 'Push', known: false });
  assert.equal(nextSplitDay([], 'Push'), null);
});

test('meal grouping totals per local day and lead exercise follows order', () => {
  const groups = groupMealsByDay([
    { logged_at: at(2026, 10, 3), calories: 500, protein_g: 30 }, { logged_at: at(2026, 10, 4, 8), calories: 300, protein_g: 10, fiber_g: 4 }, { logged_at: at(2026, 10, 4, 20), calories: 200, protein_g: 5 },
  ]);
  assert.equal(groups[0].day, '2026-10-04');
  assert.equal(groups[0].totals.calories, 500);
  assert.equal(groups[0].totals.fiber_g, 4);
  const s = { session_exercises: [{ order_index: 2, exercises: { name: 'Fly' } }, { order_index: 0, exercises: { name: 'Bench', muscle_group: 'Chest' } }] };
  assert.equal(leadExercise(s).name, 'Bench');
  assert.equal(leadExercise({ session_exercises: [] }), null);
});

test('profile age prefers explicit integer age then birth year', () => {
  const now = new Date(2026, 5, 1);
  assert.equal(profileAge({ age: 31 }, now), 31);
  assert.equal(profileAge({ birth_year: 1990 }, now), 36);
  assert.equal(profileAge({ age: 30.5 }, now), null);
  assert.equal(profileAge(null, now), null);
});
